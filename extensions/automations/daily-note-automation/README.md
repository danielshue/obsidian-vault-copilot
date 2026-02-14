# Daily Note Automation

Automatically creates and populates your daily notes each morning, saving you time and ensuring consistency in your journaling practice.

## Overview

This automation runs every morning at 6 AM and creates your daily note using the Daily Journal Agent. It can optionally include a summary of yesterday's activities to help you maintain context across days.

## Features

- **Automatic Creation**: Daily notes are created without manual intervention
- **Scheduled Execution**: Runs at 6 AM every day (customizable via cron expression)
- **Yesterday's Summary**: Optionally includes a summary of the previous day
- **Consistent Format**: Uses the Daily Journal Agent for consistent structure

## How It Works

1. **Trigger**: The automation fires at 6 AM every day based on the cron schedule `0 6 * * *`
2. **Action**: Executes the Daily Journal Agent with parameters to create today's note
3. **Configuration**: You can customize the behavior through the action's input parameters

## Installation

1. Install this automation from the Extension Browser
2. The automation is **disabled by default** after installation
3. Go to **Settings → Automations** to enable it
4. Click **Enable** to activate the automation

## Usage

### Enabling the Automation

After installation:
1. Open Obsidian Settings
2. Navigate to the Vault Copilot section
3. Scroll to the **Automations** section
4. Find "Daily Note Automation" in the list
5. Click the **Enable** button

### Testing the Automation

Before waiting until 6 AM, you can test the automation:
1. Go to **Settings → Automations**
2. Find "Daily Note Automation"
3. Click the **Run Now** button
4. Check that your daily note was created correctly

### Viewing Details

To see more information about the automation:
1. Go to **Settings → Automations**
2. Click the **Details** button for this automation
3. Review triggers, actions, and execution history

## Requirements

- Vault Copilot v0.1.0 or higher
- Daily Journal Agent (installed by default)

## License

MIT License
