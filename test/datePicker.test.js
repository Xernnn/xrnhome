import { Platform } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";

import { pickDate } from "../src/utils/datePicker";

jest.mock("@react-native-community/datetimepicker", () => ({
  DateTimePickerAndroid: { open: jest.fn() },
}));

describe("picking a date on Android", () => {
  const os = Platform.OS;
  beforeEach(() => {
    Platform.OS = "android";
  });
  afterEach(() => {
    Platform.OS = os;
    jest.clearAllMocks();
  });

  // Android's dialog gives the picked day at the time of day it opened with.
  const picks = (date) =>
    DateTimePickerAndroid.open.mockImplementation(({ onChange }) =>
      onChange({ type: "set" }, date)
    );

  it("keeps the day picked at midday, as the browser does, whatever the time", async () => {
    // Half past midnight: in UTC+7 that's still the day before in UTC, and it
    // would read as that day on a device a few zones further west.
    picks(new Date(2026, 10, 10, 0, 30));
    expect(await pickDate(new Date(2026, 10, 10, 0, 30))).toEqual(new Date(2026, 10, 10, 12));
    picks(new Date(2026, 10, 10, 23, 45));
    expect(await pickDate(new Date())).toEqual(new Date(2026, 10, 10, 12));
  });

  it("still leaves things as they were when the dialog is dismissed", async () => {
    DateTimePickerAndroid.open.mockImplementation(({ onChange }) =>
      onChange({ type: "dismissed" })
    );
    expect(await pickDate(new Date())).toBeNull();
  });
});
