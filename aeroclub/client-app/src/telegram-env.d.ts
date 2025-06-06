interface TelegramWebApp {
  initDataUnsafe: {
    start_param?: string;
    [key: string]: any;
  };
  // Add other Telegram Web App properties and methods you use
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp;
  };
}
