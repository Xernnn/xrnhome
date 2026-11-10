import { Platform } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";

// A picked day, kept as midday of it. Kept at whatever time the picker came with
// (Android's dialog gives the picked day at the time it opened with, mostly now),
// a date picked at half past midnight in UTC+7 is still the day before in UTC,
// and reads as that on a device a few time zones further west. Midday stays the
// same day for any device within 12 hours of this one.
export const middayOf = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);

// The browser's date popup. It opens from a hidden input, which has to happen
// during the click, so nothing may be awaited before calling this.
const pickInBrowser = (value) =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    const pad = (n) => String(n).padStart(2, "0");
    input.type = "date";
    input.value = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    input.style.cssText =
      "position:fixed;left:50%;top:40%;width:1px;height:1px;opacity:0;border:0;padding:0";
    const finish = (date) => {
      input.remove();
      resolve(date);
    };
    input.addEventListener("change", () => {
      const [year, month, day] = input.value.split("-").map(Number);
      finish(input.value ? middayOf(new Date(year, month - 1, day)) : null);
    });
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    try {
      input.showPicker();
    } catch (error) {
      finish(null);
    }
  });

// The system's date dialog. Resolves to the picked date, or null if it was
// dismissed, which is what lets a caller leave things as they were. iOS has no
// dialog (ItemForm shows the picker inline) and resolves to null.
export const pickDate = (value) => {
  if (Platform.OS === "web") {
    return pickInBrowser(value);
  }
  return new Promise((resolve) => {
    if (Platform.OS !== "android") {
      resolve(null);
      return;
    }
    DateTimePickerAndroid.open({
      value,
      mode: "date",
      onChange: (event, date) =>
        resolve(event.type === "set" && date ? middayOf(date) : null),
      onError: () => resolve(null),
    });
  });
};
