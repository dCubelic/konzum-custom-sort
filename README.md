# Konzum Unit Price Sorter

A Safari browser extension that adds sorting by unit price ("cijena za j.m.") on Konzum product search pages, making it easier to find the best value products.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

### Method 1: Using Safari's Develop Menu (Easiest for Testing)

1. **Enable Safari Developer Features:**
   - Open Safari
   - Go to Safari → Settings → Advanced
   - Check "Show features for web developers"

2. **Load the Extension:**
   - In Safari, go to **Develop** menu (in the menu bar)
   - Select **Allow Unsigned Extensions**
   - Go to **Develop → Web Extension Background Pages → Load Unsigned Extension...**
   - Navigate to the folder where you cloned/downloaded this extension
   - Click "Select"

3. **Enable the Extension:**
   - Go to Safari → Settings → Extensions
   - Find "Konzum Unit Price Sorter" in the list
   - Toggle it **on**
   - Click "Always Allow on Every Website" or configure for konzum.hr specifically

4. **Verify Installation:**
   - Visit https://www.konzum.hr/
   - Search for any product
   - You should see sorting buttons or options for "Cijena za j.m. uzlazno/silazno"

**Note:** Extensions loaded this way need to be reloaded each time you restart Safari.

### Method 2: Building with Xcode (Permanent Installation)

If you want a permanent installation that persists across Safari restarts:

1. **Create Xcode Project:**
   ```bash
   cd path/to/parent/directory
   xcrun safari-web-extension-converter konzum-extension --app-name "Konzum Sorter"
   ```

2. **Open and Build:**
   - Open the created Xcode project (`Konzum Sorter.xcodeproj`)
   - Select your Mac as the build target
   - Click Run (▶) to build and install the app
   - The app will launch and install the extension

3. **Enable in Safari:**
   - Go to Safari → **Develop** menu → **Allow Unsigned Extensions** (required for development builds)
   - Go to Safari → Settings → Extensions
   - Enable "Konzum Unit Price Sorter"
   - Allow it on konzum.hr

**Note:** Development builds require "Allow Unsigned Extensions" to be enabled. See "Signing for Distribution" below to create a version that doesn't require this.

## Usage

Once installed, visit any Konzum product search page. You'll see one of these:

1. **Dropdown Integration:** New options in the existing "Sortiraj po" dropdown:
   - "Cijena za j.m. uzlazno" (Unit price ascending)
   - "Cijena za j.m. silazno" (Unit price descending)

2. **Custom Buttons:** If the dropdown isn't found, custom buttons will appear at the top of the results:
   - "↑ Uzlazno" (Sort by unit price, lowest first)
   - "↓ Silazno" (Sort by unit price, highest first)

## How It Works

The extension:
1. Scans product cards on the page
2. Extracts unit price information ("Cijena za j.m.: X €/kom")
3. Sorts products based on the extracted prices
4. Reorders the product cards on the page

Products without unit price information are placed at the end of the list.

## Project Structure

```
konzum-extension/
├── manifest.json       # Extension configuration and metadata
├── content.js          # Main sorting logic and DOM manipulation
├── styles.css          # Styling for custom sort buttons
├── konzum.png          # Extension icon
├── README.md           # This file
└── LICENSE             # MIT License
```

## Troubleshooting

**Extension not working:**
- Check that the extension is enabled in Safari Settings → Extensions
- Make sure you've allowed it on konzum.hr
- Open Safari's Web Inspector (Develop → Show Web Inspector) and check the Console for any errors

**Sorting not appearing:**
- The extension looks for the sorting dropdown or creates custom buttons
- Check the browser console for debug messages
- The page structure might have changed - see the console logs for details

**Products not sorting correctly:**
- Some products might not have unit price information
- These products will be placed at the end
- Check the console for "products without unit price" messages

## Development

To modify the extension:

1. Edit the files in this directory
2. In Safari, go to Develop → Reload Extension
3. Refresh the Konzum page to see changes

For debugging:
- Open Safari Web Inspector (Develop → Show Web Inspector)
- Check the Console tab for debug messages from the extension

## Signing for Distribution

If you're enrolled in the Apple Developer Program and want to create a signed version that doesn't require "Allow Unsigned Extensions":

1. **Open the Xcode project:**
   ```bash
   cd path/to/parent/directory
   open "Konzum Sorter.xcodeproj"
   ```

2. **Configure Signing:**
   - Select the project in Xcode's navigator
   - For each target (App and Extension):
     - Go to "Signing & Capabilities"
     - Check "Automatically manage signing"
     - Select your Team from the dropdown
     - Change Bundle Identifier from `com.yourCompany.*` to your own (e.g., `com.yourname.Konzum-Sorter`)

3. **Build for Release:**
   - Select "Any Mac" as the destination
   - Product → Archive
   - Distribute App → Copy App
   - Move the app to `/Applications/`

4. **Enable in Safari:**
   - Launch the app from Applications
   - Go to Safari → Settings → Extensions
   - Enable "Konzum Unit Price Sorter"
   - No need for "Allow Unsigned Extensions" with a properly signed app!

## Browser Compatibility

This extension is designed for Safari using Manifest V3. The code uses standard web APIs and should work on:
- Safari 14+ on macOS Big Sur and later
- Safari on iOS 15+ (may require conversion to iOS extension format)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built for the Konzum online shopping platform
- Uses standard Web Extension APIs for Safari compatibility

## Disclaimer

This is an unofficial extension and is not affiliated with or endorsed by Konzum d.d.
