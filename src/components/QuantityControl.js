import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Text, TextInput } from "./Text";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { MAX_QUANTITY, TYPE } from "../utils/constants";

const REPEAT_MS = 90;
// Android's smallest touch target, in dp. A smaller button reaches it with
// hitSlop, so it looks no bigger.
const MIN_TARGET = 48;

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
  iconColor,
  hitSlop,
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
      hitSlop={hitSlop}
      style={[
        styles.button,
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
// sits between the buttons is the caller's. Each button takes touches over at
// least MIN_TARGET each way. `slop` ({ top, bottom, outer, inner }, in dp past the
// button) is for a caller that clips touches near its edge: what it can't reach
// outwards it then gives inwards, towards the value. `valueWidth` fixes the room
// between the buttons, so steppers in a column line up whatever they show.
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
  slop,
  valueWidth,
  style,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const around = Math.max(6, Math.ceil((MIN_TARGET - size) / 2));
  const { top, bottom, outer, inner } = slop || {
    top: around,
    bottom: around,
    outer: around,
    inner: around,
  };
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
        iconColor={colors.textPrimary}
        hitSlop={{ top, bottom, left: outer, right: inner }}
      />
      {children != null ? (
        <View
          style={[
            styles.valueWrap,
            valueWidth ? { width: valueWidth, flexGrow: 0, flexShrink: 0 } : null,
          ]}
        >
          {children}
        </View>
      ) : (
        <View style={styles.gap} />
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
        iconColor={colors.textPrimary}
        hitSlop={{ top, bottom, left: inner, right: outer }}
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
  valueWidth,
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
      valueWidth={valueWidth}
      repeat
      onMinus={() => change(-1)}
      onPlus={() => change(1)}
      minusDisabled={value <= min}
      plusDisabled={value >= max}
    >
      <View style={styles.valueRow}>
        {editable ? (
          <TextInput
            style={[
              styles.input,
              Platform.OS === "web" && valueWidth ? { width: valueWidth - 12 } : null,
            ]}
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
      ...TYPE.figure,
      fontSize: 18,
      color: colors.textPrimary,
    },
    input: {
      ...TYPE.figure,
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
