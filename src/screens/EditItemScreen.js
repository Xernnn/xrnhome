import React, { useMemo, useState } from "react";
import { Alert, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import ItemForm from "../components/ItemForm";
import EmptyState from "../components/EmptyState";
import { TextButton, TopBar } from "../components/ui";
import { persistImage, deleteImage } from "../utils/images";
import { haptics } from "../utils/haptics";
import { findDuplicate } from "../utils/inventoryLogic";
import { countText } from "../utils/constants";

// Two records of one item can't stay apart: they'd be merged on the next launch
// with no word about it. So the question gets asked now.
const askToMerge = (edited, other) =>
  new Promise((resolve) => {
    Alert.alert(
      `You already have ${other.name}`,
      `${other.name} in ${other.category} has ${countText(other.quantity, other.unit)}. Merge them? The counts are added and both notes are kept.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Merge", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });

export default function EditItemScreen({ navigation, route }) {
  const { itemId } = route.params || {};
  const { items, getItemById, updateItem, deleteItem, mergeItems } = useInventory();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Read once: the form edits a copy, and a change made meanwhile (an undo, a
  // sync) mustn't reset what's been typed.
  const [existing] = useState(() => getItemById(itemId));

  if (!existing) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <TopBar
          left={<TextButton label="Back" flush onPress={() => navigation.goBack()} />}
          title="Edit item"
        />
        <EmptyState
          icon="alert-circle-outline"
          title="Item not found"
          subtitle="This item may have been deleted."
        />
      </SafeAreaView>
    );
  }

  const save = async (values, changed) => {
    if (!changed) {
      navigation.goBack();
      return;
    }
    // The form holds a copy from when it opened. A count it didn't touch stays as
    // it is now, because a sync, or a click in the laptop's table beside the form,
    // may have moved it since.
    const current = getItemById(itemId) || existing;
    const countEdited =
      values.quantity !== existing.quantity ||
      values.openedPercent !== existing.openedPercent;
    const fields = countEdited
      ? values
      : { ...values, quantity: current.quantity, openedPercent: current.openedPercent };

    const duplicate = findDuplicate(items, fields, itemId);
    if (duplicate && !(await askToMerge(fields, duplicate))) {
      return false;
    }
    const previousImage = existing.imageUri;
    const imageChanged = fields.imageUri !== previousImage;
    const imageUri = imageChanged
      ? await persistImage(fields.imageUri)
      : fields.imageUri;

    if (duplicate) {
      mergeItems(itemId, duplicate.id, { ...fields, imageUri });
      haptics.success();
      navigation.navigate("ItemDetail", { itemId: duplicate.id });
      return;
    }

    updateItem(
      itemId,
      {
        ...fields,
        imageUri,
        expiryWanted: !!fields.expiryDate,
        neverRecommend: fields.recurring ? false : existing.neverRecommend,
      },
      {
        action: "Updated item details",
        quantityBefore: current.quantity,
        quantityAfter: fields.quantity,
      }
    );

    if (imageChanged && previousImage && previousImage !== imageUri) {
      deleteImage(previousImage);
    }
    haptics.success();
    navigation.goBack();
  };

  const remove = () => {
    haptics.warning();
    deleteItem(itemId);
    // Past the item's own page too, which would only say it's gone.
    navigation.popToTop();
  };

  return (
    <ItemForm
      mode="edit"
      initial={existing}
      navigation={navigation}
      onSave={save}
      onCancel={() => navigation.goBack()}
      onDelete={remove}
    />
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
  });
