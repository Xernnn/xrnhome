// The Add and Edit item page, laid out like xrnrule's Edit block: Cancel, the
// title and Save in the bar (Save waits until the item has a name), then one
// card per question, and on Edit a red "Delete item" at the bottom. Leaving with
// unsaved changes asks first, whichever way the person leaves.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
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
import {
  Card,
  ChoiceSheet,
  FormSection,
  Hairline,
  Segmented,
  TextButton,
  TopBar,
  XSwitch,
} from "./ui";
import { pickDate } from "../utils/datePicker";
import {
  OPENED_STEP,
  QUANTITY_UNITS,
  RADIUS,
  ROOMS,
  SPACING,
  TYPE,
  categoryColor,
  categoryExists,
  describeRestockRule,
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
  const [expiryDate, setExpiryDate] = useState(
    initial.expiryDate ? new Date(initial.expiryDate) : new Date()
  );
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [newCategory, setNewCategory] = useState(null);
  const [saving, setSaving] = useState(false);

  const hint = !name.trim() ? "Give it a name" : null;
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
          "Discard your changes?",
          mode === "add"
            ? "This item hasn't been saved."
            : "What you changed here hasn't been saved.",
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
      setExpiryDate(selected);
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
    if (hint || saving) {
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    leaving.current = true;
    try {
      // false: the person backed out, as from the question about merging.
      if ((await onSave(values, dirty.current)) === false) {
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
      "You'll get a few seconds to undo.",
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

  const switchLine = (label, value, onValueChange, subtitle, first = false) => (
    <>
      {first ? null : <Hairline inset={0} />}
      <TouchableOpacity
        activeOpacity={0.6}
        style={styles.switchLine}
        onPress={() => onValueChange(!value)}
      >
        <View style={styles.flex}>
          <Text style={styles.lineTitle}>{label}</Text>
          {subtitle ? <Text style={styles.lineSubtitle}>{subtitle}</Text> : null}
        </View>
        <XSwitch value={value} onValueChange={onValueChange} />
      </TouchableOpacity>
    </>
  );

  const stepperLine = (label, control) => (
    <>
      <Hairline inset={0} />
      <View style={styles.stepperLine}>
        <Text style={[styles.lineTitle, styles.flex]}>{label}</Text>
        {control}
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <TopBar
        left={<TextButton label="Cancel" flush onPress={onCancel} />}
        title={mode === "add" ? "New item" : "Edit item"}
        right={
          <TextButton
            label={saving ? "Saving" : "Save"}
            strong
            flush
            onPress={save}
            disabled={!!hint || saving}
          />
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}

          <Card>
            <View style={styles.nameRow}>
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
                  <MaterialCommunityIcons
                    name={selectedMeta.icon}
                    size={30}
                    color={tint}
                  />
                )}
                <View style={styles.photoBadge}>
                  <MaterialCommunityIcons
                    name={imageUri ? "pencil" : "camera-plus"}
                    size={13}
                    color={colors.textPrimary}
                  />
                </View>
              </TouchableOpacity>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="Item name"
                placeholderTextColor={colors.textSecondary}
                returnKeyType="done"
                multiline
                submitBehavior="blurAndSubmit"
                autoFocus={mode === "add"}
                accessibilityLabel="Item name"
                // At a keyboard, Enter saves, so adding several things is quick.
                {...(Platform.OS === "web"
                  ? { blurOnSubmit: true, onSubmitEditing: save }
                  : {})}
              />
            </View>
            {suggestions.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.7}
                style={styles.suggestion}
                onPress={() => openExisting(item)}
                accessibilityRole="button"
              >
                <View style={styles.flex}>
                  <Text style={styles.suggestionName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.lineSubtitle} numberOfLines={1}>
                    Already here · {getRoomMeta(item.room).label} · {item.category} ·{" "}
                    {stockText(item)}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            ))}
          </Card>

          <FormSection icon="shape-outline" title="What is it?">
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
                        backgroundColor: mixHex(color, colors.surface, isDark ? 0.16 : 0.1),
                        borderColor: mixHex(color, colors.surface, isDark ? 0.55 : 0.45),
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
                  onPress={() => setNewCategory("")}
                  style={styles.chip}
                >
                  <MaterialCommunityIcons
                    name="plus"
                    size={16}
                    color={colors.textSecondary}
                  />
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
                  placeholder="Category name"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={24}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={submitCategory}
                />
                <TextButton label="Add" strong onPress={submitCategory} />
                <TextButton label="Cancel" onPress={() => setNewCategory(null)} />
              </View>
            ) : null}
          </FormSection>

          <FormSection icon="counter" title="How many do you have?">
            <View style={styles.unitsRow}>
              <QuantityControl
                value={quantity}
                onChange={setQuantity}
                min={0}
                label="How many"
              />
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.unitToggle}
                onPress={() => setUnitOpen((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={`Unit: ${unit}. Change`}
              >
                <Text style={styles.unitToggleText}>{unit}</Text>
                <MaterialCommunityIcons
                  name={unitOpen ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
            {unitOpen ? (
              <View style={styles.chips}>
                {QUANTITY_UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    activeOpacity={0.7}
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
            <View style={styles.lines}>
              {switchLine(
                "Track in %",
                openedEnabled,
                setOpenedEnabled,
                "For things you use a bit at a time, like a bottle of oil"
              )}
              {openedEnabled
                ? stepperLine(
                    "Open one",
                    <QuantityControl
                      value={openedPercent}
                      onChange={setOpenedPercent}
                      min={0}
                      max={100}
                      step={OPENED_STEP}
                      unitLabel="%"
                      size={34}
                    />
                  )
                : null}
            </View>
            {openedEnabled ? (
              <Text style={styles.note}>
                The open one is part of the count above. Minus takes {OPENED_STEP}%
                of it at a time.
              </Text>
            ) : null}
          </FormSection>

          <FormSection icon="cart-outline" title="When should it go on the shopping list?">
            <View style={styles.linesFirst}>
              {switchLine(
                "When it's running low",
                recurring,
                setRecurring,
                "For things you always buy again",
                true
              )}
              {recurring
                ? stepperLine(
                    "With this many left",
                    <QuantityControl
                      value={restockUnits}
                      onChange={setRestockUnits}
                      min={0}
                      max={999}
                      size={34}
                      label="With this many left"
                    />
                  )
                : null}
              {recurring && openedEnabled
                ? switchLine(
                    "Also look at the open one",
                    watchOpen,
                    setWatchOpen,
                    "How much is left in the one you're using"
                  )
                : null}
              {recurring && openedEnabled && watchOpen
                ? stepperLine(
                    "With this much left in it",
                    <QuantityControl
                      value={restockPercent}
                      onChange={setRestockPercent}
                      min={0}
                      max={90}
                      step={OPENED_STEP}
                      unitLabel="%"
                      size={34}
                    />
                  )
                : null}
            </View>
            {recurring && openedEnabled && watchOpen ? (
              <View style={styles.matchRow}>
                <Segmented
                  options={MATCH_OPTIONS}
                  value={restockMatch}
                  onChange={setRestockMatch}
                  style={styles.flex}
                />
              </View>
            ) : null}
            <Text style={styles.note}>
              {recurring
                ? `Goes on the list ${describeRestockRule(rule)}.`
                : "When it runs out it waits under Ran out on the Shopping tab."}
            </Text>
          </FormSection>

          <FormSection icon="calendar-clock" title="Does it expire?">
            <View style={styles.linesFirst}>
              {switchLine("Expiry date", expiryEnabled, toggleExpiry, null, true)}
            </View>
            {expiryEnabled ? (
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.dateButton}
                onPress={chooseDate}
                accessibilityRole="button"
                accessibilityLabel={`Expiry date ${formatExpiryDate(
                  expiryDate.toISOString()
                )}. Tap to change.`}
              >
                <MaterialCommunityIcons
                  name="calendar"
                  size={20}
                  color={colors.textSecondary}
                />
                <Text style={styles.dateButtonText}>
                  {formatExpiryDate(expiryDate.toISOString())}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
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
          </FormSection>

          <FormSection icon="note-text-outline" title="Anything to remember?">
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              onFocus={() => {
                noteFocused.current = true;
                showNote();
              }}
              onBlur={() => {
                noteFocused.current = false;
              }}
              onContentSizeChange={() => {
                if (noteFocused.current) {
                  showNote();
                }
              }}
              placeholder="A note"
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Note"
            />
          </FormSection>

          {mode === "edit" && onDelete ? (
            <View style={styles.deleteWrap}>
              <TextButton label="Delete item" danger onPress={confirmDelete} />
            </View>
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
      paddingTop: 4,
    },
    hint: {
      ...TYPE.caption,
      color: colors.textSecondary,
      marginBottom: 8,
      marginLeft: 4,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    photoTile: {
      width: 72,
      height: 72,
      borderRadius: RADIUS.tile,
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
      right: 4,
      bottom: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    suggestion: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    suggestionName: {
      ...TYPE.body,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    newCategory: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 10,
    },
    newCategoryInput: {
      ...TYPE.body,
      flex: 1,
      backgroundColor: colors.surfaceAlt,
      borderRadius: RADIUS.button,
      paddingHorizontal: 14,
      paddingVertical: 9,
      color: colors.textPrimary,
    },
    nameInput: {
      ...TYPE.bigName,
      flex: 1,
      marginLeft: 16,
      color: colors.textPrimary,
      paddingVertical: 4,
    },
    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 14,
      gap: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 6,
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
    unitsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    unitToggle: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surfaceAlt,
      borderRadius: RADIUS.pill,
      paddingVertical: 9,
      paddingLeft: 14,
      paddingRight: 10,
    },
    unitToggleText: {
      ...TYPE.button,
      color: colors.textPrimary,
      marginRight: 4,
    },
    lines: {
      marginTop: 14,
    },
    linesFirst: {
      marginTop: -10,
    },
    switchLine: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 56,
      paddingVertical: 10,
    },
    stepperLine: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 56,
      paddingVertical: 8,
    },
    lineTitle: {
      ...TYPE.body,
      color: colors.textPrimary,
    },
    lineSubtitle: {
      ...TYPE.caption,
      color: colors.textSecondary,
      marginTop: 2,
      marginRight: 12,
    },
    matchRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 6,
    },
    note: {
      ...TYPE.caption,
      color: colors.textSecondary,
      marginTop: 10,
      lineHeight: 17,
    },
    dateButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surfaceAlt,
      borderRadius: RADIUS.button,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginTop: 4,
    },
    dateButtonText: {
      ...TYPE.body,
      flex: 1,
      fontWeight: "600",
      color: colors.textPrimary,
      marginLeft: 10,
    },
    noteInput: {
      ...TYPE.body,
      minHeight: 84,
      backgroundColor: colors.surfaceAlt,
      borderRadius: RADIUS.button,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
      color: colors.textPrimary,
    },
    deleteWrap: {
      alignItems: "center",
      marginTop: 24,
    },
    bottomSpacer: {
      height: 32,
    },
  });
