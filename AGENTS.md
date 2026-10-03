# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Project rules

Follow these in every change. Part 1 is rules the owner has given. Part 2 is rules already built into the code; many of them exist because breaking them once shipped a bug. Add new rules here when the owner gives one, or when a fix creates one.

# Part 1: the owner's rules

## Personal data

- The owner's real family tree is test data only. It lives in `local/myFamily.ts`.
- `local/` is git-ignored. Never commit it, never copy it into `src/`, and never import it from app code. It must not reach GitHub, an EAS build or the app.
- The tree a new install opens on is `src/data/sampleFamily.ts`. It is a small made-up family. Keep it made up. It includes an ended marriage with a child, so a new install shows how one looks.
- Test against the real tree with `npm run check:local`. It skips itself when the file is missing.
- Photos and names of real people never go into tracked files, fixtures or commit messages.

## Export (JSON and PDF)

- Exporting saves the file first. The user picks the folder, and the file is written there.
- After saving, show a "Saved" message with two buttons: Done and Share. Never go straight to the share sheet without saving.
- If the user closes the folder picker, do nothing.
- The shared helper is `src/utils/saveFile.ts`. Use it for any new export.

## PDF layout

- Pages are A4 landscape. Android's PDF maker always makes portrait pages (asked for landscape, it shrank each page into the top half of a portrait sheet), so on Android every sheet is portrait and each landscape page is turned a quarter turn to fill it (`turnPages`); printed, it's exactly the landscape page. iOS gets real landscape pages.
- The PDF uses the large card style: the same layout, card size and text as the app's large cards (photo on top, or bigger centered names without one), plus the years when any date is known. Each text line is drawn at exactly its measured width (`textLength`), so no font can run it past the card's edge.
- Poster scale is 0.14 mm per unit: a large card prints about 3 by 4.4 cm.
- Poster parts (the tree split over several sheets) have no margin on the left, right or bottom. The tree runs to the paper's edges.
- The strip is 10 mm, with 2 mm padding at its ends, and the small placement map's squares are sized to fill its height, so it holds no empty space. Only the top keeps a strip. It shows the tree name, the part number and a small map of where the part goes. When the sheets are laid out, it tucks under the sheet above, so nobody has to cut anything.
- No dashed cut lines.

## Tree layout

- A spouse with no recorded parents (married in from outside) sits in the cell right next to their partner.
- No empty card-width gap between spouses.
- A spouse who has their own parents in the tree stays under their own parents.
- One empty card-width cell between the children of one couple and the children of another couple (cousins), on every row below. Half-siblings (children of the same person from different marriages) stay together with no gap.
- No reserved space for someone's descendants. Branches are packed row by row: a childless person sits right beside a sibling, even if that sibling's many children spread out underneath them.
- Separate founding families (for example one headed by one founder couple and one by another) keep at least 3 empty card-widths between them where they come closest, on every row (`ROOT_FAMILY_GAP`).
- **Nothing ever crosses a card.** No line may pass through any card except the cards it connects. Fix a crossing by moving cards, never by bending a line.
- Lines are always straight. A spouse's line goes straight down from their card to the marriage bar, the bar runs straight across, and a child's line is one straight line from the ⊕ to the top of the child's card (`makeUnionRouter` in src/layout/routes.ts, shared by the canvas, minimap and PDF). The one exception is children born together (below).
- A spouse on a higher row than their marriage bar has a line running down through the rows in between; the cells right under them on those rows stay empty (`dropUntil`). The couple moves together to find such a column. A kept-empty cell is a single hole: other cards may sit right beside it on both sides, and no family gap is kept around it, so it costs as little space as possible.
- A child moved down a row by hand sits directly under their parent (just past the couple, if the parent's own line goes down), with those columns kept empty on the rows in between. Several lowered children are packed together like siblings.
- The ⊕ moves to another half-cell between the spouses when a child's line from its usual spot would cross a card.
- Someone who married into two families sits beside the partner on the highest row. A hand-set generation is ignored for anyone who married in (no parents of their own).

## One-person tree view

- No extra gap between separate families there: the person's father's and mother's sides are one family, so they keep only the normal one-cell gap (`rootFamilyGap={FAMILY_GAP}` on TreeCanvas in PersonTreeView). The 3-cell gap is for the main tree only.
- Brothers and sisters always share one row. When ancestor lines meet (cousins who married) and several children of one couple are kept, they all move to the lowest of their rows, with everyone below them (personTreeData).
- `check:families` and `check:local` run every rule on one-person trees too.

## Card text

- Every name has a maximum and a minimum size. A short name stays at the maximum and doesn't grow to fill the card. A longer name shrinks to use the card's whole width, less a small padding (`CARD_PADDING`, 3), down to the minimum (14 on compact cards, 18 on large). Only a name too long even at the minimum is cut, ending in "…". A name that fits at the minimum is never cut.
- Text never goes past the card's edge.
- Maximum sizes: compact 22; large with a photo 26; large without a photo 40, with the surname under it, both centered.
- Large cards with no photo show no placeholder at all.
- All of this lives in `cardText` / `fitLine` (src/components/cardText.ts), used by the card, the PDF and the checks. The card also has `adjustsFontSizeToFit`, so a font a little wider than the estimate shrinks slightly instead of being cut.

## Test families

- `test-families/` holds 400 generated families (`npm run generate:families`, seeded, so it always writes the same files): 300 mixed families from 1 to 500 people, 50 deep ones (10 to 18 generations) and 50 wide ones (5 generations, up to 500 people), with marriages across generations, cousin marriages, remarriages, someone married into two families, placeholder spouses, hand-set generations and child order, and very long names.
- They use only made-up English names and must share nothing with the owner's tree; `check:local` verifies that.
- `npm run check:families` runs every layout rule (scripts/lib/familyRules.ts) over all of them, and makes sure every kind of situation is still covered.
- Every commit runs `npm run check:all` first (.githooks/pre-commit, set up by `npm install`). Don't skip it with `--no-verify`.

## Children born together (twins, triplets, ...)

- `Marriage.multipleBirths`: groups of two or more of the marriage's children, any size (twins up to quintuplets and beyond), each child in one group at most. Always read them through `groupsOf` (src/layout/siblings.ts), which drops anything invalid; loading cleans them too (`normalizeFamilyData`).
- They always sit side by side: `orderedChildIds` and the layout's `bloodChildrenOf` run `keepBornTogether`, so a hand-set order or a birth-date sort can't split them. `check:families` checks no brother or sister sits between them.
- Drawn as a split line: from the ⊕ one thicker line (`trunks`, 4.5 wide, blood-line color) down to a point above the middle of the group, 60% of the way to their cards, then one line to each. Members on different rows (one moved down by hand) get plain straight lines. Trunks follow every other line rule and are checked for crossing cards too.
- Marked in the marriage form's children list: the link button between two neighbors links them (joining their groups) or unlinks them (splitting the group; a part of one is no group) (`toggleBornTogether`). Each group sits in its own tinted box (`groupBox`, gold at low opacity), like the language list, and drags as one block: dragging any of its rows moves the whole group, and only whole blocks move aside, so nothing can be dropped between them (`orderAfterDrag` in src/utils/dragOrder.ts, tested by `check:mutations`). With blocks of different heights, the dragged block's leading edge decides where it lands (its top edge going up, its bottom edge going down). The link buttons hide while dragging. Removing or deleting a child keeps the groups valid (`withoutChild`).
- Shown as "Twin of …" / "One of N born together, with …" on the info sheet and under the name in the PDF table (`bornTogetherWith`).

## Selection

- Tapping a card highlights that person's lines. Tapping empty space clears the highlight, and every line and card goes back to its normal color.
- Every tap on the tree goes through one tap gesture (`handleCanvasTap` in TreeCanvas), not a touch target per card or ⊕: it hits a card first, else the nearest ⊕ within a fingertip on screen (`FINGER`, 26 px, at any zoom, never less than `MARKER_HIT_X`×`MARKER_HIT`), else empty space. Cards are plain Views, so a drag that starts on a card pans cleanly. The edit-mode ▲▼ arrows stay their own `Pressable`s, and the tap gesture ignores taps on them.

- With someone selected, the tree and the minimap turn every card gray except the people connected to them (tree cards: `theme.panel2` fill, `theme.stroke` outline, no raise, contents at 55%; minimap: `theme.stroke`): exactly the ends of the lines that stay colored (spouses, children, parents, brothers and sisters; `connectedIds` in TreeCanvas). The selected card stays `theme.selected`.

## Marriage marker

- The ⊕ is an oval, wider than it is tall: `MARKER_RADIUS_X` (1.6 × `MARKER_RADIUS`) across, `MARKER_RADIUS` up and down, with a much wider tap area than the oval (`MARKER_HIT_X`, 150 × `MARKER_HIT`, grown to a fingertip on screen when zoomed out; the nearest ⊕ wins when areas overlap, see handleCanvasTap). Its height stays `MARKER_RADIUS` so the spacing between marriage bars doesn't change. The PDF draws the same oval.

- An ended marriage's ⊕ shows a ✕ instead of the +, drawn in `lineEnded` (a true red, #C8303C light / #F0606E dark, kept clearly apart from the gold of a current marriage), with real dashed lines at full color (`LineSegment` `dashed`: 10px dashes, 7px gaps; never fade a line to mean "ended", which made the red nearly invisible). The PDF does the same.

## Person info sheet

- Two buttons side by side: "Show family tree" (the one-person view) and "Find relationship with…", which opens Find relationship with this person already chosen first. From the side menu, Find relationship still starts empty.

## Minimap

- The minimap steers the camera: tapping a spot centers the view there, and dragging on it moves the view along with the finger (one pan with no minimum distance in Minimap.tsx). The camera is set directly, never animated, and kept within `clampAxis`.

## Running on the phone

- The owner tests in **Expo Go** by scanning a QR code. Start the server with `npx expo start --tunnel --go`.
- If the tunnel fails with ERR_NGROK_108, Expo's shared ngrok account is full. Use the server's public IP instead: `REACT_NATIVE_PACKAGER_HOSTNAME=<public ip> npx expo start --go --lan`. Then give the owner `exp://<public ip>:8081`.
- Tell the owner to scan from inside Expo Go, not with the phone camera. The camera opens an old KinBridge dev build, which is missing newer native modules such as expo-print.
- Run the server in a pseudo-terminal (`script -qfc "..." <log>`) so the QR code prints, and paste the QR code to the owner.

# Part 2: rules in the code

## Data model and dates

- `Person.born` and `died` are always Gregorian ISO `YYYY-MM-DD`. The calendar is only for picking and showing dates (`calendarFor` in src/utils/calendar.ts, `DatePicker`). Never store a date in any other format.
- Birth sorting compares the ISO strings as text. An unknown birth sorts last as `'9999-99-99'`, and ties keep the order people were added (`byBirth` in src/layout/siblings.ts).
- `Marriage.marriedYear` and `endedYear` are stored as Shamsi year numbers. Persian shows and takes them as is; every other language shows and takes Gregorian years, converted with ±621 (`marriageYearForDisplay`, `marriageYearForStorage`), the same rule both ways. Typed years go through `toAsciiDigits`, so Persian or Arabic digits work.
- `Person.nickname` shows in brackets after the name everywhere a name is shown: "Robert (Bob)". Always build names with `shortName` (cards, lists) or `fullName` (titles, sheets, the PDF table) from src/model/people.ts; name search matches nicknames too.
- Same-sex couples are supported: nothing ties a marriage to gender, and gender only sets the card color and words like husband/wife. Never add a gender rule to marriages.
- `t('deceased')` is the edit form's checkbox question («فوت کرده؟»). Showing that someone has died (info sheet, PDF table) uses `t('deceasedStatus')` («درگذشته» / "deceased"), never the question.
- Use `isDeceased(person)` (src/model/people.ts). Someone is deceased if `deceased` is true or `died` is set. Never check only one.
- PersonEditSheet drops `died` and `gravePlace` when the person isn't marked deceased. It saves empty strings as `undefined` and an empty album as `photos: undefined`. A name is required.
- `Person.unknown` is a placeholder spouse: `t('unknown')` label, dashed flat card, left out of the person-tree picker.
- `gender` is optional. Card colors and relation words use it only when set (`cardColors` in cardLook.ts, `relationWord` in RelationshipChart).
- A person has at most one set of parents (one marriage whose `childIds` holds them). "Add parents" shows only when `!hasParents()`.
- `canBeChildOf` (src/model/mutations.ts) decides who may become a couple's child: not one of the spouses, not someone who already has parents, and never an ancestor of either spouse (that loop made whole branches vanish). `addExistingChild` refuses anything else, and the "existing child" and "existing parents" pickers only offer what it allows.
- `Marriage.manualChildOrder`: when true, `childIds` order is the sibling order; when unset, children sort by birth (`orderedChildIds`). `setChildOrder` accepts only a full reordering of that marriage's own children; `resetChildOrder` clears the flag.
- If a parent has children from several marriages and any of them has a manual order, each marriage's children stay together in their own order instead of mixing by birth (`bloodChildrenOf`).
- `graveLocation` is reserved for a future map pin and is unused.

## Photos

- The avatar `Person.photoUri` is always a `data:image/jpeg;base64,...` URI, never a `file://` path. It is cropped square, 320px, JPEG 0.7 (`pickPersonPhoto` in src/utils/photo.ts).
- Album photos (`Person.photos`) stay out of the tree JSON. The whole tree is one AsyncStorage entry, and Android can't read an entry back past about 2MB (src/utils/album.ts).
- On a phone, each album photo is its own JPEG in `Paths.document/album/` (at most 1280px, JPEG 0.75). The tree stores only the file name, never the full path, because the path can change when the app updates. On web an entry is an inline data: URI. Always show an entry through `albumPhotoUri(entry)`.
- All trees share one album folder. `pruneAlbumFiles` must get every tree's data, never only the open tree, and runs only once at startup in App.tsx.
- Export embeds album files as base64 (`readAlbumFiles`). Import writes back only the photos the chosen tree uses and never overwrites an existing file (`writeAlbumFiles`).
- Photo permission is asked only on native. A refusal shows `t('photoPermissionDenied')`.

## Storage, migration, multiple trees

- AsyncStorage keys start with `kinbridge:`. Never rename them:
  - `kinbridge:family-data:v1` is the first tree (project id `'default'`); it reuses the old pre-projects key on purpose.
  - `kinbridge:family-data:v1:<projectId>` is every other tree.
  - `kinbridge:projects:v1` is the project index (`activeId`, `projects[]`).
  - `kinbridge:themeMode`, `kinbridge:onboardingSeen:v1`, `kinbridge:showMinimap:v1`, `kinbridge:cardStyle:v1`, `kinbridge:showRibbon:v1` are settings.
- Setting defaults: minimap and ribbon on unless `'0'` is stored; card style `'large'` unless `'compact'`; light theme. The language the user picks is saved (`kinbridge:locale:v1`); until then the app opens in its store version's default (see Language).
- A broken project index is rebuilt and the tree data is left alone. If `activeId` isn't in the list, the first project becomes active.
- Every load of tree data (from storage or from an import) goes through `normalizeFamilyData` (src/storage/migrate.ts). It turns an old numeric year into `YYYY-01-01`, clears a `manualGeneration` larger than the number of people, and drops child ids that point to no one and marriages missing a spouse. It returns the same object for anyone it doesn't change. migrate.ts must stay free of React Native and Expo imports.
- `sampleFamily` loads only on a fresh install with exactly one project. Every other new tree starts as one "New person" (`starterTree` in App.tsx).
- `applyMutation` (App.tsx) saves to `activeProjectRef.current`, not React state, so a save never lands in the wrong tree while switching. `openProject` clears selection and edit state and bumps `resetToken`.
- The last tree can never be deleted. Deleting a tree asks first (`confirmDestructive`).
- Tree names: `treeBaseName` («شجره‌نامه من» / "My family tree" / ...), then numbered one past the highest existing number, in any language and digit set (`nextTreeName`, using `phraseInEveryLanguage`). Duplicates get ` (2)`, ` (3)` (`uniqueName`).
- Export format: `{ kinbridgeExport: 2, exportedAt, trees: [{ name, people, marriages }], albumFiles }`. Import refuses anything else with `NOT_AN_EXPORT`, shown as `t('importNotExportFile')`. If the format changes, bump the version and keep reading version 2.
- File names are the tree name without `\/:*?"<>|`, plus the ISO date (or `family-trees` for several trees), so a new export never overwrites an old one. The PDF uses the same pattern.
- Import always adds each chosen tree as a new tree and never overwrites one.
- The native import picker is expo-file-system's `File.pickFileAsync`, not expo-document-picker, whose cache copy Expo Go can't read. It also accepts `text/plain` and `application/octet-stream`, because some phones label .json files that way.

## Mutations (src/model/mutations.ts)

- Mutations are pure: they return new FamilyData and never import i18n. Placeholder names come in as `NewPersonName`.
- A new person is `newPersonLabel` plus a number («فرد جدید ۳», "New person 3", ...), one past the highest number in any language or digit set: App passes every language's label as `NewPersonName.knownLabels` (`phraseInEveryLanguage('newPersonLabel')`).
- `addChild` copies the father's surname (the spouse with `gender === 'male'`), never the mother's. No father means a blank surname.
- `deletePerson` removes every marriage they were a spouse in and takes them out of any `childIds`. Their children stay. The caller confirms first.
- A marriage can be deleted only when it has no children (`canDeleteMarriage`).
- `addExistingChild` changes nothing if the person is already a child of that marriage.
- Every mutation that drops someone into an existing row calls `pinIntoManualRowIfNeeded` (addSpouse, addExistingSpouse, addParents, addChild, addExistingChild, movePersonGeneration). In a row that already uses `manualOrder`, the newcomer gets the cell past the highest, so two cards never stack.
- `movePersonGeneration` (the ▲▼ arrows) starts from the row the person is actually drawn on, `computeParentChildLayout(d).generationOf`, not `computeGenerations`. It tries moving the person alone first, then with a spouse, and keeps the first try that lands exactly one row away. Moving above row 0 does nothing.
- `movePersonOneStep` and `resetRowOrder` are still exported and tested, but no screen uses them now. A row is either all automatic or all manual.
- App.tsx handlers never read a new person back from `applyMutation`'s return value. It isn't reliable when updates are queued, and doing so crashed "add several children in a row".
- The marriage edit sheet keeps only `editingMarriageId` and reads the marriage from `data`, never a stored copy.
- Edit forms (MarriageEditSheet, PersonEditSheet) fill their fields from the saved data only when they open or switch to a different marriage or person (effect keyed on the id), never when the object changes while open. Adding or removing a child, spouse or parents saves at once and hands back a new object; keyed on the object, the form reset and lost unsaved picks (an ended marriage turned back to current).
- Adding a person, spouse, parents or child never opens the new person's edit sheet by itself. Adding a child keeps the marriage sheet open.

## Layout

- The app draws only `computeParentChildLayout` (TreeCanvas, PersonTreeView, the PDF). `computeLayout` and `computeRowOrder` (layout.ts, order.ts) are still tested by `check:layout`. `computeGenerations` is still used by the mutations. `buildUnions` and `mirrorX` are shared.
- parentChildLayout uses its own `computeBloodDepth`, not `computeGenerations`. Spouses never pull each other onto one row, so a person stays on their siblings' row even when the spouse's family has more recorded generations. An outsider spouse takes their partner's row.
- `computeGenerations` levels spouses onto one row, except a marriage between an ancestor and their own descendant, which is never leveled (that made generation numbers grow without bound). Its relaxation has an iteration cap.
- `manualGeneration` is a starting row. A child can never sit above a blood parent.
- A parentless person is a root unless all of their marriages are to people with recorded parents (`isRootCandidate`). A widower who remarries into a family with recorded parents keeps his first branch.
- When both spouses are anchors (for example cousins), exactly one owns the children (`sharedOwner`): the deeper one, then the earlier birth, then `spouseIds` order. Counting the children on both sides made the width grow exponentially.
- An outsider means no recorded parents and not a root-unit member (`outsiderSpousesOf`). An outsider married into two families sits beside the partner on the highest row (`homePartnerOf`), and is laid out only once (`claimed`).
- A parent is centered over their children's actual cards (`Math.floor` of the first and last cell), never over the whole branch.
- In a root unit where one member has children, that member is laid out normally and the others sit in the very next cells. If several members have children, they're packed like siblings (`rootUnitShape`).
- Separate root families keep `ROOT_FAMILY_GAP` (3 empty cells) on every row, including their own.
- A final pass moves any card that lands on a taken cell to the next free one. Cards placed earlier never move.
- Rows with more marriage lanes than fit are pushed down (deepest bar + `MARKER_RADIUS` + `CHILD_LINE_ROOM` + `maxCardHalfHeight`). `generationOf` is captured before that, and unions are rebuilt if anything moved.
- Row spacing grows by 16 per generation, and card height grows with it, both capped at `GENERATION_GROWTH_CAP` (8).
- Every size comes from `CardMetrics` (`COMPACT_METRICS`, `LARGE_METRICS`). Card style changes spacing only, never which cell or row someone lands in.
- Markers (`buildUnions`):
  - The ⊕ always sits on a half-cell, never a whole cell, so it can't cover a card.
  - It takes the half-cell between the spouses closest to its children's average cell (the bar's center with no children; ties go to the later cell). Spouses in one column use `minCell + 0.5`.
  - Within a row, the narrowest marriage picks first, so two markers never share an x. `markerY` always equals `barY`.
- Lanes: overlapping bars in a row go into lanes, each `UNION_LANE_STEP` lower. Lanes are automatic; users can't move markers.
- A marriage bar sits under the lower of the two spouses' rows, never under `spouseIds[0]` by default.
- RTL is drawn with `mirrorX(x, minX, maxX)` around the tree's own middle. Positions are never renormalized; x can be negative.
- `personTreeData` (src/model/personTree.ts) keeps ancestors (only the child on this person's line) and descendants with their spouses. It sets rows with `manualGeneration` on the copy only, counted from the person.

## Language and RTL

- The app speaks 16 languages (src/i18n/locales.ts `LOCALES`): Persian, English, Arabic, German, French, Italian, Spanish, Portuguese, Russian, Turkish, Simplified Chinese, Korean, Japanese, Hindi, Indonesian, Urdu.
- Where it opens: Bazaar in Persian; Galaxy Store in the phone's language if the app speaks it (expo-localization), else English (`defaultLocale`). A language the user picks is saved and wins after that.
- RTL follows the language (`RTL_LOCALES`: Persian, Arabic, Urdu). `I18nManager.forceRTL` is deliberately not used.
- Digits follow the language (`localDigits`): Persian ۰-۹ in Persian, Arabic ٠-٩ in Arabic, 0-9 otherwise. `toAsciiDigits` reads any of them back.
- en.ts is the source of truth. Every other language file is typed `Record<StringKey, string>` and registered in `catalogs` (src/i18n/index.ts), so every new phrase goes into all 16 files or typecheck fails. A phrase missing at runtime falls back to English. Placeholders use `{name}` and must match English exactly.
- RTL is done by hand: `row-reverse` rows, `writingDirection: 'rtl'` and right-aligned text, the side menu slides from the right, the +/↻ corners swap, and the Shamsi calendar puts Saturday on the right.
- Shamsi dates are only for Persian. Every other language uses the Gregorian calendar, everywhere: screens, the date picker and the PDF. All of it goes through `calendarFor(locale)` (src/utils/calendar.ts): Persian is `۱۳۶۴/۲/۲۷` (Persian digits, no leading zeros); other languages use the phone's `Intl` date format with month and weekday names in that language, and English names if `Intl` can't give them. Never call `formatJalali` directly from a screen.
- The language list (in the side menu, opening right there under its row, not as a second pop-up) names each language in its own script (`nativeName`), never translated. The Language row shows ▾ / ▴ (MenuRow `trailing`, its own Text), and the list sits in its own tinted box (`subList`, `theme.panel2`) so it stands apart from the menu.
- Never put an emoji in the same `Text` as Persian. Android measures it too narrow and shows nothing. Draw the emoji in its own `Text` (SideMenu `MenuRow` icon, ThanksDialog).
- All text is American English in English strings, code and comments.

## Theme

- `darkTheme` and `lightTheme` (src/theme.ts) have the same keys and meanings: gold is marriage, teal is blood line, red is an ended marriage, green is selected. Add every new color to both.
- The PDF always uses `themes.light`.
- The mourning ribbon is always black (`#050505`) with a `ribbonEdge` outline, on the top-left corner in both languages, and never takes touches.
- app.json `userInterfaceStyle` is light; the status bar follows the mode.

## Canvas and gestures (TreeCanvas and friends)

- Draw lines and the ⊕ circle as rotated plain Views (LineSegment.tsx, MarkerCircle), never react-native-svg. A big `<Svg>` crashed with "Canvas: trying to draw too large bitmap".
- Canvas buttons (only the ▲▼ arrows now) are plain `Pressable`s, never SVG `onPress`, which throws under React 19 on web.
- Pan and pinch run together and each applies a small change per frame: pan moves, pinch zooms around the focal point. Recomputing from a saved start made the camera slide sideways on every zoom.
- The content transform bakes in translate, scale, translate back. Never rely on `transformOrigin` with a Reanimated transform. ZoomableView does the same.
- Reset sets `.value` directly, never `withTiming` from the JS thread, which never landed on real phones. Letting go of a drag flings the tree with `withDecay`, started inside the pan gesture (UI thread), clamped to `axisBounds`; any new touch or pinch stops it (`stopGlide`).
- Zoom range is `MIN_SCALE` 0.05 to `MAX_SCALE` 2.5.
- A worklet ('worklet' function) must be defined below every worklet it calls in the same file (src/utils/camera.ts: `clamp`, then `axisBounds`, then `clampAxis`). Reanimated captures what a worklet calls when the file loads, and one defined later is still undefined then: the app failed to open with "undefined is not a function".
- Fit-to-screen (first open and the ↻ button) fits by height only and leaves room for the minimap (`MINIMAP_RESERVE`); fitting by width made big trees unreadable. It centers on `focusPersonId` in the one-person view, and otherwise on the person at the very top of the tree, the one with the most descendants if several share that row (`topPersonId`).
- `clampAxis` (src/utils/camera.ts) keeps the camera within `EDGE_SLACK` (0.4 of the screen) of the tree.
- On web, the wheel zooms around the cursor and `userSelect: 'none'` stops drags from selecting text.
- The gesture binds to a full-screen View, not the content box.
- A card takes two taps: the first selects it, the second opens PersonSheet (view mode) or PersonEditSheet (edit mode). A ⊕ in edit mode also takes two taps; in view mode one tap opens MarriageSheet. While `pickPrompt` is set, the next card tap goes to it.
- When a card is selected, lines not connected to that person dim to `theme.stroke`.
- Marriages are drawn in `unionsInDrawOrder`: grayed ones first and the selected person's own after them, then deeper bars first. Someone with several marriages has one drop per marriage from the same point under their card, so the drops overlap; in any other order, a grayed line covered a highlighted one (one wife's line stopped where another's ran over it). The PDF draws deeper bars first too.
- Edit mode shows ▲▼ arrows only on the selected card, in a `box-none` top layer. There are no row-order arrows.
- `MARKER_HIT` must stay under `UNION_LANE_STEP`, so stacked markers never share a tap area.
- PersonCard is its own component with `LinearTransition`, so moves (the ▲▼ arrows) animate. Its key includes `structureKey`, a fingerprint of who is married to whom and whose children are whose: when that changes, every card is drawn fresh in its new place instead of animating, because the transition left cards stuck in wrong places while the lines had already moved (lines not connected, cards missing until a restart).

## Sheets and modals

- Every Modal uses `statusBarTranslucent` and `navigationBarTranslucent` and adds the safe-area insets itself, or bottom buttons end up under the system bars.
- A sheet with a text box pads its backdrop's bottom by `useKeyboardHeight()` (src/utils/useKeyboardHeight.ts), so it sits above the on-screen keyboard: inside a Modal, Android doesn't resize the screen for the keyboard, and renaming a tree typed into a box hidden under it. Call the hook before any early `return null`.
- The tap-outside-to-close `Pressable` is a sibling behind the sheet, never a parent around the ScrollView, which breaks scrolling.
- Read `nativeEvent` values right away, never inside a state updater. React reuses the event, and this crash shipped.
- Size sheets with a pixel cap from `useWindowDimensions`, not a `'88%'` string, or they never scroll.
- A Modal that contains gestures needs its own `GestureHandlerRootView`, because on Android a Modal is outside the app root.
- Side menu:
  - It slides with a plain `translateX` shared value, not a Reanimated `entering` animation, which captured a half-height Modal. The panel is pinned with `top: 0, bottom: 0`, not `height: '100%'`.
  - Actions that change the screen or open something (edit mode, help, person tree, find relationship, import, export, PDF) close the menu first with `closeThen`, so two Modals never stack. Language, theme, minimap, card style and ribbon leave it open.
  - It lists only what the wide header shows; no license, equipment or subscription pages.
- The header's menu button is three drawn bars, not a ☰ character, which some Android fonts lack. The tree title opens ProjectsSheet. A "Done" badge is the only sign of edit mode.
- PersonSheet and MarriageSheet are read-only. Editing happens only in edit mode.
- Onboarding shows once on first launch (`ONBOARDING_SEEN_KEY`) and can be reopened from Help.

## Web and native

- `Alert.alert` does nothing on web. Use `showAlert` and `confirmDestructive` (src/utils/alert.ts). The only direct `Alert.alert` is in saveFile.ts, which is native only.
- Web export downloads a Blob through an `<a download>` link, web import uses `<input type=file>`, and web PDF opens the print dialog. Web photos are resized through a canvas.

## PDF code (src/export/pdf.ts, pdfHtml.ts)

- `printToFileAsync` gets zero margins and the `orientation: 'landscape'` cast, or Android lays the page out as portrait.
- `printToFileAsync` is called with `base64: true`, and the PDF is written from that into `Paths.cache` under its real name. Never read or move printToFileAsync's own file: in Expo Go it sits outside what the app may read ("missing READ permission").
- `buildTreePdfHtml` stays pure (no React Native imports) so it can be rendered in a desktop browser. It uses `computeParentChildLayout` with `COMPACT_METRICS` and mirrors RTL like TreeCanvas.
- The tree is drawn once as `<defs><g id="tree-art">` in a 0x0 SVG, not `display:none`, which would turn off the clip paths.
- Empty poster parts are skipped and the numbering skips them too. The poster is used only when there's more than one part. All user text goes through `escape()`.

## Ads (src/ads/)

- Never `require('react-native-google-mobile-ads')` in Expo Go or on web. Even inside try/catch it red-screens Expo Go. The check is `Constants.appOwnership === 'expo'`; don't swap it for `executionEnvironment`, which can't tell Expo Go from a dev build. Keep the extra try/catch.
- Test ads run when `__DEV__` or `EXPO_PUBLIC_ADS_TEST === '1'`. The development and preview profiles in eas.json set that variable and must keep it: preview APKs are release builds, and real ads there risk an AdMob suspension.
- Launch ad (`startLaunchAd` in launchAd.ts, free of React Native imports so it can be tested):
  - One interstitial per cold start, guarded by an in-memory ref. Nothing is saved.
  - It loads in the background and never blocks the app, then shows once loaded.
  - The `OPENED` event marks the ad as seen; `onWatched` fires only on `CLOSED` after `OPENED`. Failures are silent and give no thank-you.
  - App.tsx waits 400ms before ThanksDialog, so Android finishes leaving the ad.
- metro.config.js forces `@iabtcf/core` (from the ads package) through the CJS `require` condition, because Metro fails on its ESM imports. Keep it.
- The iOS AdMob app id in app.json is Google's sample id. Only Android has a real one.

## Release and signing

- The Android package is `com.pouya_kinbridge.shajarehnameh` and the app name is «شجره نامه». Never change the package name.
- eas.json uses `appVersionSource: "local"` with production `autoIncrement`, so `android.versionCode` in app.json is the source of truth.
- Cafe Bazaar takes a signed `.bin` made with `bundlesigner genbin` from the `.aab` (bazaar-release/README.md). Always sign with the same `.ssh-key` (project root, git-ignored) and the tracked `bazaar-release/cert.pem`. Never regenerate the certificate: Bazaar compares it byte for byte. Use `--v2-signing-enabled true --v3-signing-enabled false` with the key as PKCS#8 DER.
- `.gitignore` ignores `*.pem` but keeps `!/bazaar-release/cert.pem`, and that line must stay after `*.pem`. `/bazaar-release/*.bin`, `.ssh-key`, `/android`, `/ios` and `/local/` stay ignored.
- The EAS workflow builds Android only.

## Store versions

- One codebase, two store versions, picked at build time by `EXPO_PUBLIC_APP_VARIANT` (app.config.js, src/config/variant.ts): `bazaar` (default) is «شجره نامه» and opens in Persian; `galaxy` is "Family Tree" and opens in the phone's language or English. Same package name, signing key and everything else.
- eas.json: `preview` / `production` are Bazaar; `preview-galaxy` / `production-galaxy` are Galaxy Store.
- A fresh Galaxy install opens on `sampleFamilyEnglish` (made-up English names, same shape as the Persian sample); Bazaar on `sampleFamily`. Both are checked by `check:families`.
- To look at the Galaxy version in Expo Go: `EXPO_PUBLIC_APP_VARIANT=galaxy npx expo start --tunnel --go`.

## Builds

- `.github/workflows/release-builds.yml` runs on every push to `main` and by hand (workflow_dispatch). After `npm run check:all` it builds three files, entirely on GitHub's runner with no Expo or other outside build service (`npx expo prebuild`, then Gradle). Never add EAS (or any other build service) to it: the owner wants the pipeline local.
  - `kinbridge-phone`: the Bazaar version with test ads (`EXPO_PUBLIC_ADS_TEST=1`), arm64 only, for the owner's own phone.
  - `kinbridge-bazaar`: for the Cafe Bazaar console, both the release app bundle (`kinbridge-bazaar.aab`, signed with `jarsigner` using a keystore made on the spot from the key and `cert.pem`, after stripping Gradle's debug signature) and Bazaar's signed digest of it (`kinbridge-bazaar.bin`, made with Bazaar's bundle-signer `genbin`).
  - `kinbridge-galaxy`: the Galaxy Store release APK, every chip type.
- Expo (EAS) builds use the same Bazaar key: it's the default Android keystore in the project's EAS credentials (alias `bazaar`, SHA-256 `99:B3:11:22…`). Expo's earlier generated key is still listed there but not used.
- One signing identity for all three: the Bazaar key. The repository secret `BAZAAR_SIGNING_KEY` holds the private key (the PEM text of `.ssh-key`), and `bazaar-release/cert.pem` is its certificate; the pipeline checks they match and fails clearly if the secret is missing. So the phone APK installs as an update over the Bazaar install, and the Galaxy app has the same identity. Never sign with any other key.
- The pipeline sets the version code to 100 plus the run number (`ANDROID_VERSION_CODE`, read by app.config.js), so every build is newer than the last upload. Other builds keep app.json's.
- `expo prebuild` rewrites the `android`/`ios` scripts in package.json; don't commit that (the owner runs the app through Expo Go).
- Cloud builds on EAS: `npx eas build --profile preview --platform android`. The preview profile must keep `EXPO_PUBLIC_ADS_TEST=1` (see Ads).

## Checks

`npm run check:all` runs all of these, and runs before every commit. While working, run the ones that match what you changed:

- `typecheck`.
- `check:parentChild`: the app's tree layout, including every past layout bug above.
- `check:families`: every layout and card-text rule over the 400 test families.
- `check:local`: the same rules on the owner's real tree, and that the test families share nothing with it (skips when missing).
- `check:layout`: the older packed layout, markers and lanes.
- `check:mutations`: edits to the tree (surnames, adding, deleting, moving).
- `check:migrate`: loading old or broken data.
- `check:jalali`: Shamsi conversion, Gregorian calendars for other languages, and marriage-year conversion.
- `check:i18n`: every language file has every phrase, nothing empty, the same {placeholders} as English, and new-person numbering that carries on across languages.
- `check:launchAd`: the four launch-ad paths.

Test fixtures live in `scripts/fixtures/richFamily.ts` (made-up English names). Keep them separate from `src/data/sampleFamily.ts`.
