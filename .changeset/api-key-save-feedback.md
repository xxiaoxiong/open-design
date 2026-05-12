---
"@open-design/web": patch
---

fix(web): add success toast feedback when saving media provider API keys

When users save API keys in the Media Providers settings section, they now receive clear visual feedback via a toast notification. The toast appears after the autosave completes successfully, confirming that the settings have been saved.

This addresses issue #654 where users had to reopen settings to verify if their API key was saved successfully.

Changes:
- Added Toast component to MediaProvidersSection
- Implemented detection logic to show toast when a provider transitions from unconfigured to configured
- Added i18n keys for success messages in English and Chinese
- Toast automatically dismisses after 4 seconds

The implementation follows the existing Toast pattern used in other parts of the application and integrates seamlessly with the autosave mechanism.
