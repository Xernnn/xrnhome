// The Add and Edit item page. Cancel, the title and Save sit in the bar (Save
// waits for a name), then the item from the top down: its photo, its name,
// its category, how much there is, when it expires, when it goes on the
// shopping list and a note, each card a column of rows with the label on the
// left and what sets it on the right. On Edit, "Delete item" comes last, set
// apart. Leaving with unsaved changes asks first, whichever way the person
// leaves.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Keyboard,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import QuantityControl from "./QuantityControl";
import { Text, TextInput } from "./Text";
import {
  BarButton,
  ChoiceSheet,
  FieldRow,
  GroupCard,
  Hairline,
  OutlinePill,
  SectionLabel,
  Segmented,
  SwitchField,
  TextButton,
  TopBar,
  ValuePill,
} from "./ui";
import { middayOf, pickDate } from "../utils/datePicker";
import {
  OPENED_STEP,
  QUANTITY_UNITS,
  RADIUS,
  ROOMS,
  SPACING,
  TYPE,
  categoryColor,
  categoryExists,
  formatExpiryDate,
  getCategoryMeta,
  getRestockRule,
  getRoomCategories,
  getRoomMeta,
  isTrackingOpened,
  mixHex,
  normalizeName,
  stockText,
} from "../utils/constants";

const ROOM_OPTIONS = ROOMS.map((room) => ({
  value: room.key,
  label: room.label,
  icon: room.icon,
}));

const MATCH_OPTIONS = [
  { value: "all", label: "Both are true" },
  { value: "any", label: "Either is true" },
];

const MAX_SUGGESTIONS = 3;

// Every stepper on the page is this wide between its buttons, so they line up.
const STEPPER = { size: 34, valueWidth: 64 };

export default function ItemForm({
  mode,
  initial,
  navigation,
  onSave,
  onCancel,
  onDelete,
  onOpenExisting,
}) {
  const { colors, isDark } = useTheme();
  const { items, addCategory } = useInventory();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const startRule = getRestockRule(initial);
  const [imageUri, setImageUri] = useState(initial.imageUri || null);
  const [name, setName] = useState(initial.name || "");
  const [room, setRoom] = useState(initial.room);
  const [category, setCategory] = useState(initial.category || "Other");
  const [quantity, setQuantity] = useState(
    Number.isFinite(initial.quantity) ? initial.quantity : 1
  );
  const [unit, setUnit] = useState(initial.unit || QUANTITY_UNITS[0]);
  const [unitOpen, setUnitOpen] = useState(false);
  const [openedEnabled, setOpenedEnabled] = useState(isTrackingOpened(initial));
  const [openedPercent, setOpenedPercent] = useState(
    isTrackingOpened(initial) ? initial.openedPercent : 100
  );
  const [recurring, setRecurring] = useState(!!initial.recurring);
  const [restockUnits, setRestockUnits] = useState(startRule.units);
  const [watchOpen, setWatchOpen] = useState(startRule.percent !== null);
  const [restockPercent, setRestockPercent] = useState(
    startRule.percent !== null ? startRule.percent : 20
  );
  const [restockMatch, setRestockMatch] = useState(startRule.match);
  const [note, setNote] = useState(initial.note || "");
  const [expiryEnabled, setExpiryEnabled] = useState(!!initial.expiryDate);
  // A new date is a day, kept at midday (see middayOf); one the item has stays.
  const [expiryDate, setExpiryDate] = useState(
    initial.expiryDate ? new Date(initial.expiryDate) : middayOf(new Date())
  );
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [newCategory, setNewCategory] = useState(null);
  const [saving, setSaving] = useState(false);

  const named = name.trim().length > 0;
  const [nameFocused, setNameFocused] = useState(false);
  const [noteFocus, setNoteFocus] = useState(false);
  const selectedMeta = getCategoryMeta(category);
  const tint = categoryColor(selectedMeta, isDark);
  const rule = {
    units: restockUnits,
    percent: openedEnabled && watchOpen ? restockPercent : null,
    match: restockMatch,
  };

  const values = {
    imageUri,
    name: name.trim(),
    room,
    category,
    quantity,
    unit,
    openedPercent: openedEnabled ? openedPercent : null,
    expiryDate: expiryEnabled ? expiryDate.toISOString() : null,
    recurring,
    restockUnits: rule.units,
    restockPercent: rule.percent,
    restockMatch: rule.match,
    note: note.trim(),
  };

  // Compared with how the form started rather than with the item: an item with
  // no rule of its own opens showing the default one, which isn't a change.
  // Saving gets the starting values too, so it can write only what was changed.
  const startValues = useRef(values);
  const current = JSON.stringify(values);
  const started = useRef(current);
  const dirty = useRef(false);
  dirty.current = current !== started.current;
  const leaving = useRef(false);

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!dirty.current || leaving.current) {
          return;
        }
        event.preventDefault();
        Alert.alert(
          mode === "add" ? "Discard this item?" : "Discard your changes?",
          undefined,
          [
            { text: "Keep editing", style: "cancel" },
            {
              text: "Discard",
              style: "destructive",
              onPress: () => {
                leaving.current = true;
                navigation.dispatch(event.data.action);
              },
            },
          ]
        );
      }),
    [navigation, mode]
  );

  // Android doesn't bring a field back into view when the keyboard opens over it.
  const scroll = useRef(null);
  const noteFocused = useRef(false);
  // The page is still shrinking for the keyboard when it reports itself open.
  const showNote = () =>
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 150);
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      if (noteFocused.current) {
        showNote();
      }
    });
    return () => sub.remove();
  }, []);

  // Typing the name of something already tracked: offer that instead of a twin.
  const suggestions = useMemo(() => {
    const query = normalizeName(name);
    if (mode !== "add" || query.length < 2) {
      return [];
    }
    return items
      .filter((item) => normalizeName(item.name).includes(query))
      .slice(0, MAX_SUGGESTIONS);
  }, [items, name, mode]);

  const changeRoom = (nextRoom) => {
    setRoom(nextRoom);
    if (!categoryExists(category, nextRoom)) {
      setCategory("Other");
    }
  };

  const submitCategory = () => {
    const label = addCategory(newCategory || "", room);
    if (label) {
      setCategory(label);
      setNewCategory(null);
    } else {
      Alert.alert(
        "Can't use that name",
        "It's empty, too long, or there's a category called that already."
      );
    }
  };

  const onIosDate = (event, selected) => {
    if (selected) {
      setExpiryDate(middayOf(selected));
    }
  };

  // Android and the browser ask in a dialog: backing out of it changes nothing.
  const chooseDate = async () => {
    if (Platform.OS === "ios") {
      setExpiryEnabled(true);
      setIosPickerOpen(true);
      return;
    }
    const picked = await pickDate(expiryEnabled ? expiryDate : new Date());
    if (picked) {
      setExpiryDate(picked);
      setExpiryEnabled(true);
    }
  };

  const toggleExpiry = (value) => {
    if (value) {
      chooseDate();
    } else {
      setExpiryEnabled(false);
      setIosPickerOpen(false);
    }
  };

  const pick = async (fromCamera) => {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            "Permission needed",
            "Please allow camera access to take a photo."
          );
          return;
        }
      }
      const options = { allowsEditing: true, aspect: [1, 1], quality: 0.7 };
      // The system's photo picker hands back only what's chosen, so the library
      // needs no permission.
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({
            ...options,
            mediaTypes: ["images"],
          });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking an image:", error);
      Alert.alert("Error", "Something went wrong with the photo.");
    }
  };

  const photoOptions = [
    ...(Platform.OS === "web"
      ? []
      : [{ label: "Take a photo", icon: "camera-outline", onPress: () => pick(true) }]),
    {
      label: "Choose from your photos",
      icon: "image-outline",
      onPress: () => pick(false),
    },
    ...(imageUri
      ? [
          {
            label: "Remove the photo",
            icon: "trash-can-outline",
            danger: true,
            onPress: () => setImageUri(null),
          },
        ]
      : []),
  ];

  const save = async () => {
    if (!named || saving) {
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    leaving.current = true;
    try {
      // false: the person backed out, as from the question about merging.
      if ((await onSave(values, dirty.current, startValues.current)) === false) {
        leaving.current = false;
        setSaving(false);
      }
    } catch (error) {
      console.error("Failed to save the item:", error);
      Alert.alert("Error", "Something went wrong while saving.");
      leaving.current = false;
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      `Delete ${initial.name}?`,
      undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete item",
          style: "destructive",
          onPress: () => {
            leaving.current = true;
            onDelete();
          },
        },
      ]
    );
  };

  const openExisting = (item) => {
    leaving.current = true;
    onOpenExisting(item);
  };

  const dateText = formatExpiryDate(expiryDate.toISOString());

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <TopBar
        left={<TextButton label="Cancel" flush onPress={onCancel} />}
        title={mode === "add" ? "New item" : "Edit item"}
        right={<BarButton label="Save" onPress={save} disabled={!named || saving} />}
      />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.photoWrap}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPhotoSheet(true)}
              style={[
                styles.photoTile,
                { backgroundColor: mixHex(tint, colors.surface, isDark ? 0.16 : 0.1) },
              ]}
              accessibilityRole="button"
              accessibilityLabel={imageUri ? "Change the photo" : "Add a photo"}
            >
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.photo} />
              ) : (
                <MaterialCommunityIcons name={selectedMeta.icon} size={44} color={tint} />
              )}
            </TouchableOpacity>
            <View style={styles.photoBadge} pointerEvents="none">
              <MaterialCommunityIcons
                name={imageUri ? "pencil" : "camera-plus-outline"}
                size={16}
                color={colors.textPrimary}
              />
            </View>
          </View>

          <View style={[styles.card, nameFocused && styles.cardFocused]}>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              placeholder="Name"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              // A long name wraps on the phone; in a browser the box is one line
              // and Enter saves, so adding several things is quick.
              multiline={Platform.OS !== "web"}
              submitBehavior="blurAndSubmit"
              autoFocus={mode === "add"}
              accessibilityLabel="Item name"
              {...(Platform.OS === "web" ? { onSubmitEditing: save } : {})}
            />
            {suggestions.map((item) => (
              <React.Fragment key={item.id}>
                <Hairline />
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.suggestion}
                  onPress={() => openExisting(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.name}`}
                >
                  <MaterialCommunityIcons
                    name="arrow-top-right"
                    size={18}
                    color={colors.textSecondary}
                    style={styles.suggestionIcon}
                  />
                  <View style={styles.flex}>
                    <Text style={styles.suggestionName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.suggestionWhere} numberOfLines={1}>
                      {getRoomMeta(item.room).label} · {item.category} · {stockText(item)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>

          <SectionLabel>Category</SectionLabel>
          <View style={[styles.card, styles.cardPadded]}>
            <Segmented options={ROOM_OPTIONS} value={room} onChange={changeRoom} />
            <View style={styles.chips}>
              {getRoomCategories(room).map((cat) => {
                const active = category === cat.label;
                const color = categoryColor(cat, isDark);
                return (
                  <TouchableOpacity
                    key={cat.label}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setCategory(cat.label)}
                    style={[
                      styles.chip,
                      active && {
                        backgroundColor: mixHex(color, colors.surface, isDark ? 0.18 : 0.12),
                        borderColor: color,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name={cat.icon} size={16} color={color} />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {newCategory === null ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="New category"
                  onPress={() => setNewCategory("")}
                  style={[styles.chip, styles.chipNew]}
                >
                  <MaterialCommunityIcons name="plus" size={16} color={colors.textSecondary} />
                  <Text style={styles.chipText}>New</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {newCategory !== null ? (
              <View style={styles.newCategory}>
                <TextInput
                  style={styles.newCategoryInput}
                  value={newCategory}
                  onChangeText={setNewCategory}
                  placeholder="New category"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={24}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={submitCategory}
                  accessibilityLabel="New category"
                />
                <TextButton label="Add" strong onPress={submitCategory} />
                <TextButton label="Cancel" onPress={() => setNewCategory(null)} />
              </View>
            ) : null}
          </View>

          <SectionLabel>Amount</SectionLabel>
          <GroupCard>
            <FieldRow label="Count" first>
              <QuantityControl
                value={quantity}
                onChange={setQuantity}
                min={0}
                label="Count"
                {...STEPPER}
              />
            </FieldRow>
            <FieldRow label="Unit">
              <ValuePill
                label={unit}
                open={unitOpen}
                onPress={() => setUnitOpen((prev) => !prev)}
                accessibilityLabel={`Unit, ${unit}`}
              />
            </FieldRow>
            {unitOpen ? (
              <View style={[styles.chips, styles.unitChips]}>
                {QUANTITY_UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected: unit === u }}
                    onPress={() => {
                      setUnit(u);
                      setUnitOpen(false);
                    }}
                    style={[styles.chip, unit === u && styles.unitChipActive]}
                  >
                    <Text style={[styles.chipText, unit === u && styles.chipTextActive]}>
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <SwitchField label="Track in %" value={openedEnabled} onValueChange={setOpenedEnabled} />
            {openedEnabled ? (
              <FieldRow label="Open one">
                <QuantityControl
                  value={openedPercent}
                  onChange={setOpenedPercent}
                  min={0}
                  max={100}
                  step={OPENED_STEP}
                  unitLabel="%"
                  label="Open one"
                  {...STEPPER}
                />
              </FieldRow>
            ) : null}
          </GroupCard>

          <SectionLabel>Expiry</SectionLabel>
          <GroupCard>
            <SwitchField label="Expiry date" value={expiryEnabled} onValueChange={toggleExpiry} first />
            {expiryEnabled ? (
              <FieldRow label="Date">
                <ValuePill
                  label={dateText}
                  icon="calendar-blank-outline"
                  open={iosPickerOpen}
                  onPress={chooseDate}
                  accessibilityLabel={`Expiry date, ${dateText}`}
                />
              </FieldRow>
            ) : null}
            {expiryEnabled && iosPickerOpen ? (
              <DateTimePicker
                value={expiryDate}
                mode="date"
                display="inline"
                onChange={onIosDate}
                themeVariant={isDark ? "dark" : "light"}
              />
            ) : null}
          </GroupCard>

          <SectionLabel>Shopping list</SectionLabel>
          <GroupCard>
            <SwitchField
              label="When it's running low"
              value={recurring}
              onValueChange={setRecurring}
              first
            />
            {recurring ? (
              <FieldRow label="Down to">
                <QuantityControl
                  value={restockUnits}
                  onChange={setRestockUnits}
                  min={0}
                  max={999}
                  label="Down to"
                  {...STEPPER}
                />
              </FieldRow>
            ) : null}
            {recurring && openedEnabled ? (
              <SwitchField
                label="Watch the open one"
                value={watchOpen}
                onValueChange={setWatchOpen}
              />
            ) : null}
            {recurring && openedEnabled && watchOpen ? (
              <>
                <FieldRow label="Open one at">
                  <QuantityControl
                    value={restockPercent}
                    onChange={setRestockPercent}
                    min={0}
                    max={90}
                    step={OPENED_STEP}
                    unitLabel="%"
                    label="Open one at"
                    {...STEPPER}
                  />
                </FieldRow>
                <Hairline />
                <View style={styles.matchRow}>
                  <Segmented
                    options={MATCH_OPTIONS}
                    value={restockMatch}
                    onChange={setRestockMatch}
                  />
                </View>
              </>
            ) : null}
          </GroupCard>

          <SectionLabel>Note</SectionLabel>
          <View style={[styles.card, noteFocus && styles.cardFocused]}>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              onFocus={() => {
                noteFocused.current = true;
                setNoteFocus(true);
                showNote();
              }}
              onBlur={() => {
                noteFocused.current = false;
                setNoteFocus(false);
              }}
              onContentSizeChange={() => {
                if (noteFocused.current) {
                  showNote();
                }
              }}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Note"
            />
          </View>

          {mode === "edit" && onDelete ? (
            <OutlinePill
              label="Delete item"
              icon="trash-can-outline"
              danger
              onPress={confirmDelete}
              style={styles.delete}
            />
          ) : null}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>

      <ChoiceSheet
        visible={photoSheet}
        title="Photo"
        options={photoOptions}
        onClose={() => setPhotoSheet(false)}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: SPACING.screen,
      paddingTop: 8,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    cardPadded: {
      padding: 16,
    },
    cardFocused: {
      borderColor: colors.accent,
    },
    photoWrap: {
      alignSelf: "center",
      marginTop: 4,
      marginBottom: 18,
    },
    photoTile: {
      width: 112,
      height: 112,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    photo: {
      width: "100%",
      height: "100%",
    },
    photoBadge: {
      position: "absolute",
      right: -6,
      bottom: -6,
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    nameInput: {
      ...TYPE.title,
      fontSize: 20,
      minHeight: 58,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 14,
      color: colors.textPrimary,
      textAlignVertical: "center",
    },
    suggestion: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 56,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    suggestionIcon: {
      marginRight: 12,
    },
    suggestionName: {
      ...TYPE.body,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    suggestionWhere: {
      ...TYPE.caption,
      color: colors.textSecondary,
      marginTop: 2,
      marginRight: 12,
    },
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 14,
      gap: 8,
    },
    unitChips: {
      marginTop: 0,
      paddingHorizontal: 16,
      paddingBottom: 14,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      height: 36,
      paddingHorizontal: 12,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 6,
    },
    chipNew: {
      borderStyle: "dashed",
      borderColor: colors.outline,
    },
    chipText: {
      ...TYPE.bodySmall,
      color: colors.textPrimary,
    },
    chipTextActive: {
      fontWeight: "600",
    },
    unitChipActive: {
      backgroundColor: colors.accentLight,
      borderColor: colors.accent,
    },
    newCategory: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 12,
    },
    newCategoryInput: {
      ...TYPE.body,
      flex: 1,
      height: 42,
      backgroundColor: colors.surfaceAlt,
      borderRadius: RADIUS.button,
      paddingHorizontal: 14,
      color: colors.textPrimary,
    },
    matchRow: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    noteInput: {
      ...TYPE.body,
      minHeight: 96,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 14,
      color: colors.textPrimary,
    },
    delete: {
      marginTop: 32,
    },
    bottomSpacer: {
      height: 40,
    },
  });
