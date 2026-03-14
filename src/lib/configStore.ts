export interface AppConfig {
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  googleMapsApiKey: string;
  /** Google OAuth 2.0 Web Client ID (from Google Cloud Console / Firebase Auth settings).
   *  Required for the GIS silent token refresh mechanism.
   *  Format: NUMBERS-HASH.apps.googleusercontent.com */
  googleOAuthClientId?: string;
}

const CONFIG_KEY = 'dois_studio_config';

export const configStore = {
  getConfig: (): AppConfig | null => {
    const data = localStorage.getItem(CONFIG_KEY);
    return data ? JSON.parse(data) : null;
  },

  saveConfig: (config: AppConfig): void => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  },

  clearConfig: (): void => {
    localStorage.removeItem(CONFIG_KEY);
  },

  hasConfig: (): boolean => {
    return !!localStorage.getItem(CONFIG_KEY);
  }
};
