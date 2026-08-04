# PantryPal

A simple kitchen inventory app for your phone. Add the food you keep at home, tap
a button when you use some, and let the app tell you what needs restocking.

Everything lives on your device. There is no account, no server, and nothing
leaves your phone.

| My Kitchen | Shopping | Item detail |
| :--: | :--: | :--: |
| ![My Kitchen](docs/screenshots/kitchen-light.png) | ![Shopping](docs/screenshots/shopping-light.png) | ![Item detail](docs/screenshots/detail-light.png) |

| Adding an item | Dark mode |
| :--: | :--: |
| ![Adding an item](docs/screenshots/add-light.png) | ![Dark mode](docs/screenshots/kitchen-dark.png) |

## Features

- **Track what you have** — every item gets a photo, a category, a count and an
  optional note.
- **Count part-used items** — for things like a bottle of oil, track how much of
  the open one is left instead of pretending it is full or empty.
- **Shopping list** — flag items you always re-buy and they show up under
  "Buy Now" as soon as they run low.
- **Nothing gets lost** — items you finish move to a "Previously Had" list, so you
  can put them back on the shopping list or delete them for good.
- **Quick to browse** — items are grouped by category, sections collapse, and
  search hides behind a button until you need it.
- **Light and dark** — follows your system theme.

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- The [Expo Go](https://expo.dev/go) app on your phone, for development

## Getting started

```bash
git clone <your-repo-url>
cd kitchenpal
npm install
npm start
```

Scan the QR code with Expo Go, or press `a` / `i` in the terminal to open an
Android or iOS simulator. There are no custom native modules, so Expo Go is
enough for day-to-day development.

Your computer and phone need to be on the same network. If the QR code will not
connect, a tunnel usually gets around it:

```bash
npx expo start --tunnel
```

## Installing it on your phone

To get a real app you can keep, build an APK with
[EAS](https://docs.expo.dev/build/introduction/):

```bash
npm install -g eas-cli
eas login
eas build --profile preview --platform android
```

The build runs in the cloud and finishes with a download link. Open it on your
phone and install. That copy runs on its own with no computer attached, and its
data is separate from anything you added in Expo Go.

## How the counting works

Each item has a single count of units, and that count includes the one you have
already opened. Three bottles where the open one is 40% full is *3 bottles, open
one at 40%*.

Pressing minus takes a bite out of the open unit. When it is used up, the count
drops by one and the next unit opens. For items where a part-used count makes no
sense — eggs, cans, packets — turn "Partially used" off and minus just removes a
whole unit.

## Project structure

```
App.js                  navigation, tabs and providers
src/
  screens/              My Kitchen, Shopping, Add, Edit, Item detail
  components/           item cards, search bar, quantity control, badges
  context/              inventory state and theme
  utils/                categories, units, styling tokens, local storage
assets/                 app icon and splash image
```

## Built with

React Native, [Expo](https://expo.dev/) (SDK 54),
[React Navigation](https://reactnavigation.org/) and
[AsyncStorage](https://react-native-async-storage.github.io/async-storage/) for
local persistence.
