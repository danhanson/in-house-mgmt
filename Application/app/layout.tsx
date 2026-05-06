import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import NavbarSimple from "./components/Navbar/Navbar";
import EnvironmentBanner, { getEnvironment } from "./components/EnvironmentBanner";
import { UserProvider } from "./components/provider/UserContext";
import { TimezoneProvider } from "./components/provider/TimezoneContext";
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { theme } from "./lib/theme";
// Import datetime utils to ensure dayjs plugins are configured
import "@/app/utils/datetime";

const titlePrefix = getEnvironment()?.titlePrefix;

export const metadata: Metadata = {
  title: titlePrefix
    ? { template: `${titlePrefix} %s`, default: `${titlePrefix} DGG CRM` }
    : "DGG CRM",
  description: "Volunteer Console CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript />
      </head>

      <body>
        <EnvironmentBanner />
        <UserProvider>
          <MantineProvider theme={theme}>
            <Notifications position="top-center" />
            <TimezoneProvider>
              <div
                style={{
                  alignItems: "stretch",
                  display: "flex",
                  minHeight: "100vh",
                }}
              >
                <NavbarSimple />
                <main style={{ borderLeft: "1px solid #dee2e6", flex: 1, padding: "20px" }}>
                  {children}
                </main>
              </div>
            </TimezoneProvider>
          </MantineProvider>
        </UserProvider>
      </body>
    </html>
  );
}
