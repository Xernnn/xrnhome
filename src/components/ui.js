// The building blocks of every screen, after xrnrule's Components.kt: rounded
// cards with a hairline border, grouped rows like a settings list, small-caps
// section labels, round header buttons, full-width pills and an on/off switch
// in the app's green.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import {
  BRAND,
  FONTS,
  RADIUS,
  SPACING,
  TYPE,
  categoryColor,
  getCategoryMeta,
  hexToRgba,
  mixHex,
} from "../utils/constants";

const useStyles = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return { colors, styles };
};

// A soft rounded container: the main layout unit on every screen.
export function Card({ children, style, padding = SPACING.card }) {
  const { styles } = useStyles();
  return <View style={[styles.card, { padding }, style]}>{children}</View>;
}

// One of a form's cards: a grey icon and a question over its content.
export function FormSection({ icon, title, children, style }) {
  const { colors, styles } = useStyles();
  return (
    <Card style={[styles.formSection, style]}>
      <View style={styles.questionRow}>
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={colors.textSecondary}
        />
        <Text style={styles.question}>{title}</Text>
      </View>
      <View style={styles.formSectionBody}>{children}</View>
    </Card>
  );
}

// A card of rows separated by inset hairlines.
export function GroupCard({ children, style }) {
  const { styles } = useStyles();
  return <View style={[styles.card, styles.groupCard, style]}>{children}</View>;
}

export function Hairline({ inset = 16 }) {
  const { styles } = useStyles();
  return <View style={[styles.hairline, { marginLeft: inset }]} />;
}

// One row of a GroupCard: an icon, a title with an optional line under it, and
// whatever goes on the right. Draws the hairline above itself unless `first`.
export function GroupRow({
  title,
  subtitle,
  icon,
  iconColor,
  first = false,
  onPress,
  chevron = !!onPress,
  trailing,
  danger = false,
  disabled = false,
  accessibilityLabel,
}) {
  const { colors, styles } = useStyles();
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <>
      {first ? null : <Hairline inset={icon ? 52 : 16} />}
      <Wrapper
        activeOpacity={0.6}
        onPress={onPress}
        disabled={disabled}
        style={[styles.groupRow, disabled && styles.disabled]}
        accessibilityRole={onPress ? "button" : undefined}
        accessibilityLabel={accessibilityLabel}
      >
        {icon ? (
          <MaterialCommunityIcons
            name={icon}
            size={22}
            color={danger ? colors.danger : iconColor || colors.textSecondary}
            style={styles.groupRowIcon}
          />
        ) : null}
        <View style={styles.flex}>
          <Text
            style={[styles.groupRowTitle, danger && { color: colors.danger }]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.groupRowSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        {chevron ? (
          <MaterialCommunityIcons
            name="chevron-right"
            size={22}
            color={colors.textSecondary}
          />
        ) : null}
      </Wrapper>
    </>
  );
}

// On/off in the app's colours: green with a white thumb when on, a grey ring
// with a small grey thumb when off (Material 3's switch, as xrnrule draws it).
export function XSwitch({ value, onValueChange, disabled = false }) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 140,
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  const thumbSize = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 24],
  });
  const thumbLeft = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 24],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      onPress={() => onValueChange && onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: !!value, disabled }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <View
        style={{
          width: 52,
          height: 32,
          borderRadius: 16,
          borderWidth: 2,
          borderColor: value ? colors.accent : colors.textSecondary,
          backgroundColor: value ? colors.accent : "transparent",
          justifyContent: "center",
        }}
      >
        <Animated.View
          style={{
            position: "absolute",
            left: thumbLeft,
            width: thumbSize,
            height: thumbSize,
            borderRadius: 12,
            backgroundColor: value ? colors.onAccent : colors.textSecondary,
          }}
        />
      </View>
    </TouchableOpacity>
  );
}

// A GroupRow whose right side is a switch; the whole row toggles it.
export function SwitchRow({
  title,
  subtitle,
  icon,
  value,
  onValueChange,
  first = false,
  disabled = false,
}) {
  return (
    <GroupRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      first={first}
      disabled={disabled}
      chevron={false}
      onPress={() => onValueChange(!value)}
      trailing={
        <XSwitch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
        />
      }
    />
  );
}

// A small-caps heading over a group: "APPEARANCE".
export function SectionLabel({ children, top = 20 }) {
  const { styles } = useStyles();
  return <Text style={[styles.sectionLabel, { marginTop: top }]}>{children}</Text>;
}

// A grey explanation line under a group.
export function FootNote({ children, style }) {
  const { styles } = useStyles();
  return <Text style={[styles.footNote, style]}>{children}</Text>;
}

// The big lowercase page title ("food", "settings") with actions on the right.
export function PageTitle({ title, subtitle, actions }) {
  const { styles } = useStyles();
  return (
    <View style={styles.pageTitleRow}>
      <View style={styles.flex}>
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {actions ? <View style={styles.pageActions}>{actions}</View> : null}
    </View>
  );
}

// "xrnhome" in the mono face, after the launcher icon's colour.
export function Wordmark({ size = 20 }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <MaterialCommunityIcons name="home-variant" size={size} color={BRAND} />
      <Text
        style={{
          fontFamily: FONTS.mono,
          fontSize: size,
          color: colors.textPrimary,
          marginLeft: 6,
        }}
      >
        xrnhome
      </Text>
    </View>
  );
}

// A round header button: filled on the raised grey (back, close), or outlined
// on the card grey with a smaller icon, as xrnrule's "+".
export function RoundIconButton({
  icon,
  onPress,
  label,
  outlined = false,
  active = false,
  size = 38,
  color,
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active
          ? colors.accentLight
          : outlined
          ? colors.surface
          : colors.surfaceAlt,
        borderWidth: outlined ? 1 : 0,
        borderColor: active ? colors.accent : colors.border,
      }}
    >
      <MaterialCommunityIcons
        name={icon}
        size={size * (outlined ? 0.5 : 0.55)}
        color={color || (active ? colors.accent : colors.textPrimary)}
      />
    </TouchableOpacity>
  );
}

// A page's main action: a full-width pill, green unless told otherwise.
export function PillButton({
  label,
  onPress,
  icon,
  disabled = false,
  tone = "accent",
  style,
}) {
  const { colors, styles } = useStyles();
  const background = tone === "neutral" ? colors.surfaceAlt : colors.accent;
  const foreground = tone === "neutral" ? colors.textPrimary : colors.onAccent;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        styles.pill,
        { backgroundColor: disabled ? colors.surfaceAlt : background },
        style,
      ]}
    >
      {icon ? (
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={disabled ? colors.textSecondary : foreground}
          style={styles.pillIcon}
        />
      ) : null}
      <Text
        style={[
          styles.pillText,
          { color: disabled ? colors.textSecondary : foreground },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// A quieter full-width pill, outlined.
export function OutlinePill({ label, onPress, icon, disabled = false, style }) {
  const { colors, styles } = useStyles();
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.outlinePill, disabled && styles.disabled, style]}
    >
      {icon ? (
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={colors.textPrimary}
          style={styles.pillIcon}
        />
      ) : null}
      <Text style={styles.outlinePillText} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// A row of choices where one is picked: the picked one sits raised on the grey.
export function Segmented({ options, value, onChange, style }) {
  const { colors, styles } = useStyles();
  return (
    <View style={[styles.segmented, style]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            activeOpacity={0.7}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            {option.icon ? (
              <MaterialCommunityIcons
                name={option.icon}
                size={17}
                color={active ? colors.textPrimary : colors.textSecondary}
                style={styles.segmentIcon}
              />
            ) : null}
            <Text
              style={[styles.segmentText, active && styles.segmentTextActive]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// A full-screen page's bar: text buttons on either side and the title between
// them (Cancel · Edit item · Save), or a round back button.
export function TopBar({ title, left, right }) {
  const { styles } = useStyles();
  return (
    <View style={styles.topBar}>
      <View style={[styles.topBarSide, styles.topBarLeft]}>{left}</View>
      <Text style={styles.topBarTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.topBarSide, styles.topBarRight]}>{right}</View>
    </View>
  );
}

// `flush`: sits in a TopBar, so its text lines up with the page's margin.
export function TextButton({
  label,
  onPress,
  disabled = false,
  strong = false,
  danger = false,
  flush = false,
}) {
  const { colors, styles } = useStyles();
  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[styles.textButton, flush && styles.textButtonFlush]}
    >
      <Text
        style={[
          styles.textButtonLabel,
          strong && styles.textButtonStrong,
          {
            color: disabled
              ? colors.textSecondary
              : danger
              ? colors.danger
              : colors.textPrimary,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// An item's picture: its photo, or its category's icon on a tint when it has
// none. A photo whose file has gone falls back to the icon too.
export function ItemThumb({ item, size, radius = 12, iconSize = 22 }) {
  const { colors, isDark } = useTheme();
  const [failed, setFailed] = useState(null);
  const meta = getCategoryMeta(item.category);
  const color = categoryColor(meta, isDark);
  const tile = {
    width: size,
    height: size,
    borderRadius: radius,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mixHex(color, colors.surface, isDark ? 0.16 : 0.1),
  };
  return (
    <View style={tile}>
      {item.imageUri && failed !== item.imageUri ? (
        <Image
          source={{ uri: item.imageUri }}
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(item.imageUri)}
        />
      ) : (
        <MaterialCommunityIcons name={meta.icon} size={iconSize} color={color} />
      )}
    </View>
  );
}

// A small green action inside a list row.
// A filter that can be on or off, with an optional count.
export function Chip({ label, count, selected = false, onPress }) {
  const { styles } = useStyles();
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.chip, selected && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text
        style={[styles.chipLabel, selected && styles.chipLabelOn]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
      {count != null ? (
        <Text
          style={[styles.chipCount, selected && styles.chipLabelOn]}
          maxFontSizeMultiplier={1.3}
        >
          {count}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// Gives what's inside a small bounce whenever `value` changes, but not on arrival.
export function Pop({ value, style, children }) {
  const scale = useRef(new Animated.Value(1)).current;
  const arrived = useRef(false);
  useEffect(() => {
    if (!arrived.current) {
      arrived.current = true;
      return;
    }
    scale.setValue(1.25);
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 180,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [value, scale]);
  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
  );
}

export function TagButton({ label, onPress, accessibilityLabel }) {
  const { styles } = useStyles();
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.tagButton}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={styles.tagButtonLabel} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// A sheet of choices from the bottom, for when Android's dialog can't do: it
// shows three buttons at most and drops the rest, Cancel first. Back and a tap
// outside close it. `options`: [{ label, icon, danger, onPress }].
export function ChoiceSheet({ visible, title, options, onClose }) {
  const { colors, styles } = useStyles();
  const choose = (option) => {
    onClose();
    option.onPress();
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        style={[styles.scrim, { backgroundColor: hexToRgba(colors.shadow, 0.45) }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Pressable style={styles.sheet}>
          {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
          <GroupCard>
            {options.map((option, index) => (
              <GroupRow
                key={option.label}
                first={index === 0}
                icon={option.icon}
                title={option.label}
                danger={option.danger}
                chevron={false}
                onPress={() => choose(option)}
              />
            ))}
          </GroupCard>
          <OutlinePill label="Cancel" onPress={onClose} style={styles.sheetCancel} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    tagButton: {
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.accentLight,
      marginLeft: 6,
    },
    tagButtonLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.onAccentLight,
    },
    scrim: {
      flex: 1,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: RADIUS.card,
      borderTopRightRadius: RADIUS.card,
      padding: SPACING.screen,
      paddingBottom: 48,
    },
    sheetTitle: {
      ...TYPE.question,
      color: colors.textSecondary,
      marginLeft: 4,
      marginBottom: 12,
    },
    sheetCancel: {
      marginTop: 12,
    },
    disabled: {
      opacity: 0.5,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    groupCard: {
      overflow: "hidden",
    },
    formSection: {
      marginTop: 14,
    },
    questionRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    question: {
      ...TYPE.question,
      color: colors.textSecondary,
      marginLeft: 12,
      flex: 1,
    },
    formSectionBody: {
      marginTop: 14,
    },
    hairline: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    groupRow: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 56,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    groupRowIcon: {
      marginRight: 14,
    },
    groupRowTitle: {
      ...TYPE.body,
      color: colors.textPrimary,
    },
    groupRowSubtitle: {
      ...TYPE.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    trailing: {
      marginLeft: 12,
    },
    sectionLabel: {
      ...TYPE.section,
      color: colors.textSecondary,
      marginLeft: 4,
      marginBottom: 10,
    },
    footNote: {
      ...TYPE.caption,
      color: colors.textSecondary,
      marginHorizontal: 6,
      marginTop: 8,
      lineHeight: 17,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      height: 34,
      paddingHorizontal: 14,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipOn: {
      backgroundColor: colors.textPrimary,
      borderColor: colors.textPrimary,
    },
    chipLabel: {
      fontSize: 13.5,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    chipLabelOn: {
      color: colors.background,
    },
    chipCount: {
      marginLeft: 6,
      fontFamily: FONTS.monoMedium,
      fontSize: 12,
      color: colors.textSecondary,
    },
    pageTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 64,
      paddingHorizontal: SPACING.screen,
      paddingTop: 6,
      paddingBottom: 4,
    },
    pageTitle: {
      ...TYPE.pageTitle,
      color: colors.textPrimary,
    },
    pageSubtitle: {
      ...TYPE.caption,
      color: colors.textSecondary,
      marginTop: 1,
    },
    pageActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    pill: {
      minHeight: 54,
      borderRadius: 27,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    pillIcon: {
      marginRight: 8,
    },
    pillText: {
      ...TYPE.title,
    },
    outlinePill: {
      minHeight: 50,
      borderRadius: 25,
      borderWidth: 1,
      borderColor: colors.outline,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    outlinePillText: {
      ...TYPE.button,
      color: colors.textPrimary,
    },
    segmented: {
      flexDirection: "row",
      backgroundColor: colors.surfaceAlt,
      borderRadius: RADIUS.pill,
      padding: 3,
    },
    segment: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 9,
      borderRadius: RADIUS.pill,
    },
    segmentActive: {
      backgroundColor: colors.surface,
    },
    segmentIcon: {
      marginRight: 6,
    },
    segmentText: {
      ...TYPE.button,
      fontWeight: "500",
      color: colors.textSecondary,
    },
    segmentTextActive: {
      fontWeight: "600",
      color: colors.textPrimary,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      height: 60,
      paddingHorizontal: SPACING.screen,
    },
    topBarSide: {
      width: 72,
      flexDirection: "row",
      alignItems: "center",
    },
    topBarLeft: {
      justifyContent: "flex-start",
    },
    topBarRight: {
      justifyContent: "flex-end",
    },
    topBarTitle: {
      ...TYPE.barTitle,
      flex: 1,
      textAlign: "center",
      color: colors.textPrimary,
    },
    textButton: {
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    textButtonFlush: {
      marginHorizontal: -10,
    },
    textButtonLabel: {
      ...TYPE.body,
    },
    textButtonStrong: {
      fontWeight: "600",
    },
  });
