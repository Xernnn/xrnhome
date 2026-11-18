// Settings → Your categories: the ones the person added, by type. Removing one
// moves its items to "Other".
import React, { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TextInput } from "../components/Text";
import { SafeAreaView } from "react-native-safe-area-context";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import {
  Card,
  GroupCard,
  GroupRow,
  RoundIconButton,
  SectionLabel,
  Segmented,
  TopBar,
} from "../components/ui";
import { RADIUS, ROOMS, SPACING, TYPE, categoryColor, itemCount } from "../utils/constants";

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
  const [focused, setFocused] = useState(false);

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

  const byRoom = ROOMS.map((entry) => ({
    room: entry,
    list: categories.filter((category) => category.room === entry.key),
  })).filter((group) => group.list.length > 0);

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
        <SectionLabel top={4}>New category</SectionLabel>
        <Card padding={16}>
          <Segmented options={ROOM_OPTIONS} value={room} onChange={setRoom} />
          <View style={[styles.addRow, focused && { borderColor: colors.accent }]}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Name"
              placeholderTextColor={colors.textSecondary}
              maxLength={24}
              returnKeyType="done"
              onSubmitEditing={add}
              accessibilityLabel="Category name"
            />
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.addButton, !name.trim() && styles.addButtonOff]}
              onPress={add}
              disabled={!name.trim()}
              accessibilityRole="button"
              accessibilityLabel="Add the category"
            >
              <MaterialCommunityIcons name="plus" size={22} color={colors.onAccent} />
            </TouchableOpacity>
          </View>
        </Card>

        {byRoom.map(({ room: entry, list }) => (
          <React.Fragment key={entry.key}>
            <SectionLabel>{entry.label}</SectionLabel>
            <GroupCard>
              {list.map((category, index) => (
                <GroupRow
                  key={category.label}
                  first={index === 0}
                  icon={category.icon}
                  iconColor={categoryColor(category, isDark)}
                  title={category.label}
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
          </React.Fragment>
        ))}
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
      minHeight: 50,
      paddingLeft: 16,
      paddingRight: 5,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    input: {
      ...TYPE.body,
      flex: 1,
      paddingVertical: 0,
      color: colors.textPrimary,
    },
    addButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonOff: {
      opacity: 0.4,
    },
  });
