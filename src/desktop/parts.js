import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export const Icon = ({ name, size = 18, color = "currentColor" }) => (
  <MaterialCommunityIcons name={name} size={size} color={color} />
);
