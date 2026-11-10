import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import {
  FONTS,
  MAX_QUANTITY,
  PACK_BUTTON_INK,
  PACK_INK,
  hexToRgba,
} from "../utils/constants";

const REPEAT_MS = 90;

// A round − or + that can repeat while it's held. Long-pressing does `onHold`
// instead when there is one.
function StepButton({
  icon,
  size,
  onPress,
  onHold,
  repeat,
  disabled,
  label,
  styles,
  look,
  iconColor,
}) {
  const press = useRef(onPress);
  press.current = onPress;
  const timer = useRef(null);
  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => stop, []);

  const hold = onHold
    ? onHold
    : repeat
    ? () => {
        timer.current = setInterval(() => press.current(), REPEAT_MS);
      }
    : undefined;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      onLongPress={hold}
      onPressOut={stop}
      delayLongPress={350}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={[
        styles.button,
        look,
        { width: size, height: size, borderRadius: size / 2 },
        disabled && styles.buttonDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={size * 0.5} color={iconColor} />
    </TouchableOpacity>
  );
}

// − something + with round grey buttons. The one stepper in the app: whatever
// sits between the buttons is the caller's. `onPack` is for a card in its pack's
// colour, where + is the strong one.
export function Stepper({
  children,
  onMinus,
  onPlus,
  onPlusHold,
  minusDisabled = false,
  plusDisabled = false,
  minusLabel = "Less",
  plusLabel = "More",
  repeat = false,
  size = 38,
  onPack = false,
  style,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.container, style]}>
      <StepButton
        icon="minus"
        size={size}
        onPress={onMinus}
        repeat={repeat}
        disabled={minusDisabled}
        label={minusLabel}
        styles={styles}
        look={onPack ? styles.packMinus : null}
        iconColor={onPack ? PACK_INK : colors.textPrimary}
      />
      {children != null ? (
        <View style={styles.valueWrap}>{children}</View>
      ) : (
        <View style={onPack ? styles.packGap : styles.gap} />
      )}
      <StepButton
        icon="plus"
        size={size}
        onPress={onPlus}
        onHold={onPlusHold}
        repeat={repeat}
        disabled={plusDisabled}
        label={plusLabel}
        styles={styles}
        look={onPack ? styles.packPlus : null}
        iconColor={onPack ? PACK_BUTTON_INK : colors.textPrimary}
      />
    </View>
  );
}

// A number with a Stepper round it, for forms. Holding a button repeats, and a
// whole-number count can also be typed.
export default function QuantityControl({
  value,
  onChange,
  min = 0,
  max = MAX_QUANTITY,
  step = 1,
  unitLabel = "",
  size = 38,
  label = "Amount",
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [typing, setTyping] = useState(null);
  const clamp = (n) => Math.max(min, Math.min(max, n));
  const editable = step === 1;

  const change = (dir) => {
    setTyping(null);
    const next = clamp(value + dir * step);
    if (next !== value) {
      onChange(next);
    }
  };

  const onType = (text) => {
    const digits = text.replace(/[^0-9]/g, "").slice(0, 7);
    setTyping(digits);
    if (digits !== "") {
      onChange(clamp(parseInt(digits, 10)));
    }
  };

  return (
    <Stepper
      size={size}
      repeat
      onMinus={() => change(-1)}
      onPlus={() => change(1)}
      minusDisabled={value <= min}
      plusDisabled={value >= max}
    >
      <View style={styles.valueRow}>
        {editable ? (
          <TextInput
            style={styles.input}
            value={typing ?? String(value)}
            onChangeText={onType}
            onBlur={() => setTyping(null)}
            keyboardType="number-pad"
            selectTextOnFocus
            maxFontSizeMultiplier={1.3}
            accessibilityLabel={label}
          />
        ) : (
          <Text style={styles.value} maxFontSizeMultiplier={1.3}>
            {value}
          </Text>
        )}
        {unitLabel ? (
          <Text style={styles.value} maxFontSizeMultiplier={1.3}>
            {unitLabel}
          </Text>
        ) : null}
      </View>
    </Stepper>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
    },
    button: {
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonDisabled: {
      opacity: 0.4,
    },
    packMinus: {
      backgroundColor: hexToRgba(PACK_INK, 0.2),
    },
    packPlus: {
      backgroundColor: PACK_INK,
    },
    packGap: {
      width: 6,
    },
    valueWrap: {
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 40,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    gap: {
      width: 12,
    },
    valueRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    value: {
      fontFamily: FONTS.mono,
      fontSize: 18,
      color: colors.textPrimary,
    },
    input: {
      fontFamily: FONTS.mono,
      fontSize: 18,
      color: colors.textPrimary,
      textAlign: "center",
      minWidth: 40,
      paddingVertical: 2,
      paddingHorizontal: 0,
      // A browser's <input> keeps a wide default size instead of fitting its text.
      ...(Platform.OS === "web" ? { width: 64 } : null),
    },
  });
