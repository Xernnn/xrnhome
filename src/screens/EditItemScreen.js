import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  Switch,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActionSheetIOS,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import QuantityControl from "../components/QuantityControl";
import EmptyState from "../components/EmptyState";
import { persistImage, deleteImage } from "../utils/images";
import { haptics } from "../utils/haptics";
import {
  SPACING,
  RADIUS,
  SHADOW,
  CATEGORIES,
  STORAGE_LOCATIONS,
  QUANTITY_UNITS,
  OPENED_STEP,
  hexToRgba,
  isTrackingOpened,
  getContrastText,
  summarizeUnits,
  formatExpiryDate,
} from "../utils/constants";

export default function EditItemScreen({ navigation, route }) {
  const { itemId } = route.params || {};
  const { getItemById, updateItem } = useInventory();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const existing = getItemById(itemId);

  const [imageUri, setImageUri] = useState(existing ? existing.imageUri : null);
  const [name, setName] = useState(existing ? existing.name : "");
  const [category, setCategory] = useState(existing ? existing.category : null);
  const [storageLocation, setStorageLocation] = useState(
    existing ? existing.storageLocation : null
  );
  const [quantity, setQuantity] = useState(existing ? existing.quantity : 1);
  const [unit, setUnit] = useState(existing ? existing.unit : QUANTITY_UNITS[0]);
  const [openedEnabled, setOpenedEnabled] = useState(
    existing ? isTrackingOpened(existing) : false
  );
  const [openedPercent, setOpenedPercent] = useState(
    existing && isTrackingOpened(existing) ? existing.openedPercent : 100
  );
  const [recurring, setRecurring] = useState(
    existing ? !!existing.recurring : false
  );
  const [expiryEnabled, setExpiryEnabled] = useState(
    !!(existing && existing.expiryDate)
  );
  const [expiryDate, setExpiryDate] = useState(
    existing && existing.expiryDate ? new Date(existing.expiryDate) : new Date()
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState(existing ? existing.note : "");
  const [nameFocused, setNameFocused] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  const onChangeDate = (event, selected) => {
    if (Platform.OS !== "ios") {
      setShowDatePicker(false);
    }
    if (event.type === "set" && selected) {
      setExpiryDate(selected);
    }
  };

  const toggleExpiry = (value) => {
    setExpiryEnabled(value);
    if (value && Platform.OS !== "ios") {
      setShowDatePicker(true);
    }
  };

  if (!existing) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
            style={styles.headerButton}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={colors.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Item</Text>
          <View style={styles.headerButton} />
        </View>
        <EmptyState
          icon="alert-circle-outline"
          title="Item not found"
          subtitle="This item may have been deleted."
        />
      </SafeAreaView>
    );
  }

  const pickFromLibrary = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow photo library access to choose an image."
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image from library:", error);
      Alert.alert("Error", "Something went wrong while choosing the image.");
    }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow camera access to take a photo."
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert("Error", "Something went wrong while taking the photo.");
    }
  };

  const handleImagePress = () => {
    const options = imageUri
      ? ["Cancel", "Take Photo", "Choose from Library", "Remove Photo"]
      : ["Cancel", "Take Photo", "Choose from Library"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: imageUri ? 3 : undefined,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            takePhoto();
          } else if (buttonIndex === 2) {
            pickFromLibrary();
          } else if (buttonIndex === 3 && imageUri) {
            setImageUri(null);
          }
        }
      );
    } else {
      const buttons = [
        { text: "Take Photo", onPress: takePhoto },
        { text: "Choose from Library", onPress: pickFromLibrary },
      ];
      if (imageUri) {
        buttons.push({
          text: "Remove Photo",
          style: "destructive",
          onPress: () => setImageUri(null),
        });
      }
      buttons.push({ text: "Cancel", style: "cancel" });
      Alert.alert("Edit Photo", "Choose an option", buttons);
    }
  };

  const validate = () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Please enter an item name.");
      return false;
    }
    if (!category) {
      Alert.alert("Missing category", "Please select a category.");
      return false;
    }
    if (!storageLocation) {
      Alert.alert(
        "Missing storage location",
        "Please select where this item is stored."
      );
      return false;
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      Alert.alert("Invalid quantity", "Quantity must be a positive number.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate() || saving) {
      return;
    }
    setSaving(true);
    try {
      const previousImage = existing.imageUri;
      const imageChanged = imageUri !== previousImage;
      const storedImageUri = imageChanged
        ? await persistImage(imageUri)
        : imageUri;

      updateItem(
        itemId,
        {
          name: name.trim(),
          category,
          storageLocation,
          imageUri: storedImageUri,
          quantity,
          unit,
          openedPercent: openedEnabled ? openedPercent : null,
          expiryDate: expiryEnabled ? expiryDate.toISOString() : null,
          recurring,
          note: note.trim(),
        },
        {
          action: "Updated item details",
          quantityBefore: existing.quantity,
          quantityAfter: quantity,
        }
      );

      if (imageChanged && previousImage && previousImage !== storedImageUri) {
        deleteImage(previousImage);
      }

      haptics.success();
      navigation.goBack();
    } catch (error) {
      console.error("Failed to update item:", error);
      Alert.alert("Error", "Something went wrong while saving changes.");
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Item</Text>
        <View style={styles.headerButton} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.imageArea}
            onPress={handleImagePress}
          >
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.image} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <MaterialCommunityIcons
                  name="camera-plus-outline"
                  size={42}
                  color={colors.textSecondary}
                />
                <Text style={styles.imagePlaceholderText}>Add a photo</Text>
              </View>
            )}
            {imageUri ? (
              <View style={styles.imageEditBadge}>
                <MaterialCommunityIcons
                  name="pencil"
                  size={16}
                  color={colors.white}
                />
              </View>
            ) : null}
          </TouchableOpacity>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={[styles.input, nameFocused && styles.inputFocused]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Olive Oil"
            placeholderTextColor={colors.textSecondary}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
          />

          <Text style={styles.label}>Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {CATEGORIES.map((cat) => {
              const active = category === cat.label;
              const activeText = getContrastText(cat.color);
              return (
                <TouchableOpacity
                  key={cat.label}
                  activeOpacity={0.7}
                  onPress={() => setCategory(cat.label)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: active
                        ? cat.color
                        : hexToRgba(cat.color, 0.12),
                      borderColor: cat.color,
                      borderWidth: active ? 0 : 1,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={cat.icon}
                    size={16}
                    color={active ? activeText : cat.color}
                  />
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: active ? activeText : cat.color },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Storage Location</Text>
          <View style={styles.segmented}>
            {STORAGE_LOCATIONS.map((loc) => {
              const active = storageLocation === loc;
              return (
                <TouchableOpacity
                  key={loc}
                  activeOpacity={0.7}
                  onPress={() => setStorageLocation(loc)}
                  style={[styles.segment, active && styles.segmentActive]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      active && styles.segmentTextActive,
                    ]}
                  >
                    {loc}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Sealed Units</Text>
          <View style={styles.quantityRow}>
            <QuantityControl value={quantity} onChange={setQuantity} min={0} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {QUANTITY_UNITS.map((u) => {
              const active = unit === u;
              return (
                <TouchableOpacity
                  key={u}
                  activeOpacity={0.7}
                  onPress={() => setUnit(u)}
                  style={[styles.unitChip, active && styles.unitChipActive]}
                >
                  <Text
                    style={[
                      styles.unitChipText,
                      active && styles.unitChipTextActive,
                    ]}
                  >
                    {u}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.toggleHeader}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.sectionTitle}>Track opened unit (%)</Text>
              <Text style={styles.toggleHint}>
                For a unit you've already opened, e.g. a can that's 40% left.
              </Text>
            </View>
            <Switch
              value={openedEnabled}
              onValueChange={setOpenedEnabled}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.white}
            />
          </View>

          {openedEnabled ? (
            <View style={styles.openedSection}>
              <Text style={styles.label}>Remaining in opened unit</Text>
              <View style={styles.percentRow}>
                <QuantityControl
                  value={openedPercent}
                  onChange={setOpenedPercent}
                  min={0}
                  max={100}
                  step={OPENED_STEP}
                  unitLabel="%"
                />
              </View>
              <Text style={styles.openedHint}>
                This is a separate, already-open unit — counted on top of the
                sealed units above.
              </Text>
            </View>
          ) : null}

          <Text style={styles.summary}>
            {summarizeUnits(quantity, unit, openedEnabled ? openedPercent : null)}
          </Text>

          <View style={styles.toggleHeader}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.sectionTitle}>Expiry date</Text>
              <Text style={styles.toggleHint}>
                Get visual "expiring soon" / "expired" reminders on the item.
              </Text>
            </View>
            <Switch
              value={expiryEnabled}
              onValueChange={toggleExpiry}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.white}
            />
          </View>

          {expiryEnabled ? (
            <View style={styles.expirySection}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Expiry date ${formatExpiryDate(
                  expiryDate.toISOString()
                )}. Tap to change.`}
              >
                <MaterialCommunityIcons
                  name="calendar"
                  size={20}
                  color={colors.accent}
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
              {showDatePicker ? (
                <DateTimePicker
                  value={expiryDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  onChange={onChangeDate}
                  themeVariant={colors.background === "#121212" ? "dark" : "light"}
                />
              ) : null}
            </View>
          ) : null}

          <View style={styles.toggleHeader}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.sectionTitle}>Re-buy when empty</Text>
              <Text style={styles.toggleHint}>
                Add to your Shopping list automatically when it runs low.
              </Text>
            </View>
            <Switch
              value={recurring}
              onValueChange={setRecurring}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.white}
            />
          </View>

          <Text style={styles.label}>Note</Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              noteFocused && styles.inputFocused,
            ]}
            value={note}
            onChangeText={setNote}
            placeholder="Any notes about this item..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
          />

          <View style={styles.bottomSpacer} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <MaterialCommunityIcons
              name="content-save"
              size={20}
              color={colors.white}
              style={styles.saveIcon}
            />
            <Text style={styles.saveButtonText}>
              {saving ? "Saving..." : "Save Changes"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: SPACING.screen,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    scrollContent: {
      padding: SPACING.screen,
    },
    imageArea: {
      width: "100%",
      aspectRatio: 16 / 9,
      borderRadius: RADIUS.card,
      backgroundColor: colors.surfaceAlt,
      overflow: "hidden",
      marginBottom: SPACING.screen,
    },
    image: {
      width: "100%",
      height: "100%",
      resizeMode: "cover",
    },
    imagePlaceholder: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    imagePlaceholderText: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: SPACING.inner,
    },
    imageEditBadge: {
      position: "absolute",
      bottom: 10,
      right: 10,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    label: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: SPACING.inner,
      marginTop: SPACING.card,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.button,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: SPACING.card,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.textPrimary,
    },
    inputFocused: {
      borderColor: colors.accent,
    },
    textArea: {
      minHeight: 90,
      paddingTop: 12,
    },
    chipsRow: {
      paddingVertical: 4,
      paddingRight: SPACING.inner,
    },
    categoryChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: RADIUS.pill,
      marginRight: SPACING.inner,
    },
    categoryChipText: {
      fontSize: 13,
      fontWeight: "600",
      marginLeft: 6,
    },
    segmented: {
      flexDirection: "row",
      backgroundColor: colors.surfaceAlt,
      borderRadius: RADIUS.button,
      padding: 4,
    },
    segment: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: RADIUS.button - 2,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentActive: {
      backgroundColor: colors.accent,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    segmentTextActive: {
      color: colors.white,
    },
    quantityRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: SPACING.inner,
    },
    unitChip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceAlt,
      marginRight: SPACING.inner,
    },
    unitChipActive: {
      backgroundColor: colors.accent,
    },
    unitChipText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    unitChipTextActive: {
      color: colors.white,
    },
    toggleHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: SPACING.screen,
    },
    toggleTextWrap: {
      flex: 1,
      paddingRight: SPACING.card,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    toggleHint: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },
    openedSection: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      padding: SPACING.card,
      marginTop: SPACING.inner,
      ...SHADOW,
    },
    openedHint: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: SPACING.inner,
      lineHeight: 16,
    },
    summary: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.accent,
      marginTop: SPACING.card,
      backgroundColor: colors.accentLight,
      paddingVertical: 8,
      paddingHorizontal: SPACING.card,
      borderRadius: RADIUS.button,
      overflow: "hidden",
    },
    expirySection: {
      marginTop: SPACING.inner,
    },
    dateButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: RADIUS.button,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: SPACING.card,
      paddingVertical: 12,
    },
    dateButtonText: {
      flex: 1,
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
      marginLeft: SPACING.inner,
    },
    percentRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    footer: {
      padding: SPACING.screen,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    saveButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
      paddingVertical: 15,
      borderRadius: RADIUS.button,
    },
    saveIcon: {
      marginRight: 8,
    },
    saveButtonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: "700",
    },
    bottomSpacer: {
      height: 24,
    },
  });
