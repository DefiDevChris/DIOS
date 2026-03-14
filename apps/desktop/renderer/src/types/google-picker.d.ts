// Type declarations for the Google Picker API
// Loaded dynamically via https://apis.google.com/js/api.js + gapi.load('picker', ...)

interface GooglePickerDocument {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  type: string;
  description?: string;
  lastEditedUtc?: number;
  iconUrl?: string;
  sizeBytes?: number;
}

interface GooglePickerData {
  action: string;
  docs: GooglePickerDocument[];
  viewToken?: string[];
}

interface GooglePickerDocsView {
  setMimeTypes(mimeTypes: string): GooglePickerDocsView;
  setIncludeFolders(include: boolean): GooglePickerDocsView;
  setSelectFolderEnabled(enabled: boolean): GooglePickerDocsView;
  setMode(mode: string): GooglePickerDocsView;
}

interface GooglePickerBuilder {
  addView(view: GooglePickerDocsView): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  setDeveloperKey(key: string): GooglePickerBuilder;
  setCallback(callback: (data: GooglePickerData) => void): GooglePickerBuilder;
  setTitle(title: string): GooglePickerBuilder;
  enableFeature(feature: string): GooglePickerBuilder;
  setSize(width: number, height: number): GooglePickerBuilder;
  build(): GooglePicker;
}

interface GooglePicker {
  setVisible(visible: boolean): void;
  dispose(): void;
}

interface GooglePickerStatic {
  Action: {
    PICKED: string;
    CANCEL: string;
  };
  DocsView: new () => GooglePickerDocsView;
  PickerBuilder: new () => GooglePickerBuilder;
  Feature: {
    NAV_HIDDEN: string;
    MULTISELECT_ENABLED: string;
  };
  ViewId: {
    DOCS: string;
    SPREADSHEETS: string;
  };
}

interface Window {
  gapi: {
    load(api: string, callback: () => void): void;
    client: {
      init(config: object): Promise<void>;
      setToken(token: { access_token: string }): void;
      drive: unknown;
    };
  };
  google: {
    picker: GooglePickerStatic;
    accounts?: Window['google']['accounts'];
  };
}
