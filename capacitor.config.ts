import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.onetaprequest.app",
  appName: "One Tap Request",
  webDir: "www",
  server: {
    androidScheme: "https"
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#fff7f2"
    }
  }
};

export default config;
