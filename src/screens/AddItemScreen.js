import React from "react";

import { useInventory } from "../context/InventoryContext";
import ItemForm from "../components/ItemForm";
import { persistImage } from "../utils/images";
import { haptics } from "../utils/haptics";
import { DEFAULT_ROOM, QUANTITY_UNITS } from "../utils/constants";

export default function AddItemScreen({ navigation, route }) {
  const { addItem } = useInventory();
  const initial = {
    name: route.params?.name || "",
    room: route.params?.room || DEFAULT_ROOM,
    category: route.params?.category || "Other",
    quantity: 1,
    unit: QUANTITY_UNITS[0],
    openedPercent: null,
    recurring: false,
  };

  const save = async (values) => {
    const imageUri = await persistImage(values.imageUri);
    addItem({ ...values, imageUri }, { announce: true });
    haptics.success();
    navigation.goBack();
  };

  return (
    <ItemForm
      mode="add"
      initial={initial}
      navigation={navigation}
      onSave={save}
      onCancel={() => navigation.goBack()}
      onOpenExisting={(item) =>
        navigation.replace("ItemDetail", { itemId: item.id })
      }
    />
  );
}
