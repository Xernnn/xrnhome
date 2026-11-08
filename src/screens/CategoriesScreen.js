// Settings → Your categories: the ones the person added, by type. Removing one
// moves its items to "Other".
import React, { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import {
  FootNote,
  GroupCard,
  GroupRow,
  RoundIconButton,
  SectionLabel,
  Segmented,
  TextButton,
  TopBar,
} from "../components/ui";
import { RADIUS, ROOMS, SPACING, TYPE, categoryColor, getRoomMeta, itemCount } from "../utils/constants";

const ROOM_OPTIONS = ROOMS.map((room) => ({
  value: room.key,
  label: room.label,
  icon: room.icon,
}));

export default function CategoriesScreen({ navigation }) {
  const { items, categories, addCategory, removeCategory } = useInventory();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [room, setRoom] = useState(ROOMS[0].key);
  const [name, setName] = useState("");

  const add = () => {
    if (addCategory(name, room)) {
      setName("");
    } else {
      Alert.alert(
        "Can't use that name",
        "It's empty, too long, or there's a category called that already."
      );
    }
  };

  const confirmRemove = (category) => {
    const count = items.filter((item) => item.category === category.label).length;
    Alert.alert(
      `Remove ${category.label}?`,
      count > 0 ? `Its ${itemCount(count)} will move to Other.` : "It has no items.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeCategory(category.label),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <TopBar
        left={
          <RoundIconButton
            icon="arrow-left"
            label="Back"
            onPress={() => navigation.goBack()}
          />
        }
        title="Your categories"
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel top={4}>Add one</SectionLabel>
        <Segmented options={ROOM_OPTIONS} value={room} onChange={setRoom} />
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Category name"
            placeholderTextColor={colors.textSecondary}
            maxLength={24}
            returnKeyType="done"
            onSubmitEditing={add}
            accessibilityLabel="Category name"
          />
          <TextButton label="Add" strong onPress={add} />
        </View>

        {categories.length > 0 ? (
          <>
            <SectionLabel>Yours</SectionLabel>
            <GroupCard>
              {categories.map((category, index) => (
                <GroupRow
                  key={category.label}
                  first={index === 0}
                  icon={category.icon}
                  iconColor={categoryColor(category, isDark)}
                  title={category.label}
                  subtitle={getRoomMeta(category.room).label}
                  chevron={false}
                  trailing={
                    <RoundIconButton
                      icon="trash-can-outline"
                      label={`Remove ${category.label}`}
                      onPress={() => confirmRemove(category)}
                    />
                  }
                />
              ))}
            </GroupCard>
          </>
        ) : (
          <FootNote>
            The built-in categories always stay. Yours show up after them when
            you add or edit an item.
          </FootNote>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: SPACING.screen,
      paddingBottom: 32,
    },
    addRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 12,
    },
    input: {
      ...TYPE.body,
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.button,
      paddingHorizontal: 14,
      paddingVertical: 11,
      color: colors.textPrimary,
    },
  });
