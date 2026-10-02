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

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import QuantityControl from "../components/QuantityControl";
import RoomPicker from "../components/RoomPicker";
import {
  SPACING,
  RADIUS,
  SHADOW,
  DEFAULT_ROOM,
  QUANTITY_UNITS,
  OPENED_STEP,
  categoryExists,
  getCategoryMeta,
  getRoomCategories,
  hexToRgba,
} from "../utils/constants";

export default function AddItemScreen({ navigation, route }) {
  const { addItem } = useInventory();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [imageUri, setImageUri] = useState(null);
  const [name, setName] = useState("");
  const [room, setRoom] = useState(
    (route.params && route.params.room) || DEFAULT_ROOM
  );
  const [category, setCategory] = useState(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState(QUANTITY_UNITS[0]);
  const [unitOpen, setUnitOpen] = useState(false);
  const [openedEnabled, setOpenedEnabled] = useState(false);
  const [openedPercent, setOpenedPercent] = useState(100);
  const [recurring, setRecurring] = useState(false);
  const [note, setNote] = useState("");
  const [nameFocused, setNameFocused] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);

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
        aspect: [1, 1],
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
        aspect: [1, 1],
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
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Take Photo", "Choose from Library"],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            takePhoto();
          } else if (buttonIndex === 2) {
            pickFromLibrary();
          }
        }
      );
    } else {
      Alert.alert("Add Photo", "Choose an option", [
        { text: "Take Photo", onPress: takePhoto },
        { text: "Choose from Library", onPress: pickFromLibrary },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const changeRoom = (nextRoom) => {
    setRoom(nextRoom);
    if (category && !categoryExists(category, nextRoom)) {
      setCategory(null);
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
    if (!Number.isFinite(quantity) || quantity < 0) {
      Alert.alert("Invalid quantity", "Quantity must be a positive number.");
      return false;
    }
    return true;
  };

  const handleSave = () => {
    if (!validate()) {
      return;
    }
    addItem({
      name: name.trim(),
      room,
      category,
      imageUri,
      quantity,
      unit,
      openedPercent: openedEnabled ? openedPercent : null,
      recurring,
      note: note.trim(),
    });
    navigation.goBack();
  };

  const selectedMeta = category ? getCategoryMeta(category) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
        >
          <MaterialCommunityIcons
            name="close"
            size={24}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Item</Text>
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
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
          />

          <Text style={styles.label}>Room</Text>
          <RoomPicker value={room} onChange={changeRoom} />

          <Text style={styles.label}>Category</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.selector}
            onPress={() => setCategoryOpen((prev) => !prev)}
          >
            {selectedMeta ? (
              <>
                <MaterialCommunityIcons
                  name={selectedMeta.icon}
                  size={20}
                  color={selectedMeta.color}
                />
                <Text style={styles.selectorValue}>{category}</Text>
              </>
            ) : (
              <Text style={styles.selectorEmpty}>Choose a category</Text>
            )}
            <MaterialCommunityIcons
              name={categoryOpen ? "chevron-up" : "chevron-down"}
              size={22}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {categoryOpen ? (
            <View style={styles.grid}>
              {getRoomCategories(room).map((cat) => {
                const active = category === cat.label;
                return (
                  <TouchableOpacity
                    key={cat.label}
                    activeOpacity={0.7}
                    onPress={() => {
                      setCategory(cat.label);
                      setCategoryOpen(false);
                    }}
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
                      color={active ? colors.white : cat.color}
                    />
                    <Text
                      style={[
                        styles.categoryChipText,
                        { color: active ? colors.white : cat.color },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.label}>Units</Text>
          <View style={styles.unitsRow}>
            <QuantityControl value={quantity} onChange={setQuantity} min={0} />
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.unitToggle}
              onPress={() => setUnitOpen((prev) => !prev)}
            >
              <Text style={styles.unitToggleText}>{unit}</Text>
              <MaterialCommunityIcons
                name={unitOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.accent}
              />
            </TouchableOpacity>
          </View>

          {unitOpen ? (
            <View style={styles.grid}>
              {QUANTITY_UNITS.map((u) => {
                const active = unit === u;
                return (
                  <TouchableOpacity
                    key={u}
                    activeOpacity={0.7}
                    onPress={() => {
                      setUnit(u);
                      setUnitOpen(false);
                    }}
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
            </View>
          ) : null}

          <View style={styles.toggleRow}>
            <Text style={styles.sectionTitle}>Track in %</Text>
            <Switch
              value={openedEnabled}
              onValueChange={setOpenedEnabled}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.white}
            />
          </View>

          {openedEnabled ? (
            <View style={styles.openedSection}>
              <QuantityControl
                value={openedPercent}
                onChange={setOpenedPercent}
                min={0}
                max={100}
                step={OPENED_STEP}
                unitLabel="%"
              />
            </View>
          ) : null}

          <View style={styles.toggleRow}>
            <Text style={styles.sectionTitle}>Shopping list</Text>
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
            style={styles.saveButton}
            onPress={handleSave}
          >
            <MaterialCommunityIcons
              name="content-save"
              size={20}
              color={colors.white}
              style={styles.saveIcon}
            />
            <Text style={styles.saveButtonText}>Save Item</Text>
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
      aspectRatio: 1,
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
    selector: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: RADIUS.button,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: SPACING.card,
      paddingVertical: 13,
    },
    selectorValue: {
      flex: 1,
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
      marginLeft: SPACING.inner,
    },
    selectorEmpty: {
      flex: 1,
      fontSize: 16,
      color: colors.textSecondary,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: SPACING.inner,
    },
    categoryChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: RADIUS.pill,
      marginRight: SPACING.inner,
      marginBottom: SPACING.inner,
    },
    categoryChipText: {
      fontSize: 13,
      fontWeight: "600",
      marginLeft: 6,
    },
    unitsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    unitToggle: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accentLight,
      borderRadius: RADIUS.pill,
      paddingVertical: 9,
      paddingHorizontal: 14,
    },
    unitToggleText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.accent,
      marginRight: 4,
    },
    unitChip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceAlt,
      marginRight: SPACING.inner,
      marginBottom: SPACING.inner,
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
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: SPACING.screen,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    openedSection: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      padding: SPACING.card,
      marginTop: SPACING.card,
      ...SHADOW,
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
