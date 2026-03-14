// Type declarations for Google Identity Services (GIS) SDK
// Loaded via <script src="https://accounts.google.com/gsi/client">
// This is an ambient declaration file (no imports/exports) so all types are globally available.

interface GisTokenClientConfig {
  client_id: string;
  scope: string;
  prompt?: string;
  hint?: string;
  callback: (response: GisTokenResponse) => void;
  error_callback?: (error: GisTokenClientError) => void;
}

interface GisTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

interface GisTokenClientError {
  type: string;
  message?: string;
}

interface GisTokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string; hint?: string }): void;
}

interface GisOAuth2 {
  initTokenClient(config: GisTokenClientConfig): GisTokenClient;
  revoke(token: string, done?: () => void): void;
}

interface GisAccounts {
  oauth2: GisOAuth2;
  id: {
    initialize(config: object): void;
    prompt(callback?: (notification: object) => void): void;
    renderButton(element: HTMLElement, config: object): void;
  };
}

// Augment Window to add GIS accounts alongside the existing google.maps property
interface Window {
  google?: Window['google'] & {
    accounts?: GisAccounts;
  };
}
