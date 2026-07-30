import { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { initiateSSOLogin } from "../auth/index";
import { theme } from "./theme";

type LoginState = "init" | "no_secret" | "waiting" | "success" | "error";

interface LoginScreenProps {
  onLogin: () => void;
  onSkip: () => void;
}

export default function LoginScreen({ onLogin, onSkip }: LoginScreenProps) {
  const [loginState, setLoginState] = useState<LoginState>("init");
  const [userCode, setUserCode] = useState("");
  const [verifyUri, setVerifyUri] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const hasSecret = !!(process.env.MTC_AZURE_CLIENT_SECRET ?? "");
    if (!hasSecret) {
      setLoginState("no_secret");
      return;
    }
    startLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startLogin = useCallback(async () => {
    setLoginState("waiting");
    try {
      await initiateSSOLogin((code, uri) => {
        setUserCode(code);
        setVerifyUri(uri);
      });
      setLoginState("success");
      onLogin();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setLoginState("error");
    }
  }, [onLogin]);

  useInput((_input, key) => {
    if (key.escape || _input === "s" || _input === "S") {
      onSkip();
      return;
    }
    if (loginState === "error") {
      if (_input === "r" || _input === "R") {
        startLogin();
      }
      if (_input === "q" || _input === "Q") {
        process.exit(0);
      }
    }
  });

  if (loginState === "success") {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      height="100%"
    >
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.muted}
        paddingX={3}
        paddingY={2}
        width={70}
      >
        <Box marginBottom={1}>
          <Text bold color={theme.colors.primary}>
            MetaTeam Code Agent (mtc) Authentication
          </Text>
        </Box>

        <Text color={theme.colors.text}>
          Sign in with your @metateammyanmar.com account to enable cloud features.
        </Text>

        {loginState === "waiting" && userCode && (
          <Box flexDirection="column" marginTop={1}>
            <Box marginTop={1}>
              <Text color={theme.colors.muted}>1. Open browser: </Text>
              <Text bold color={theme.colors.secondary}>
                {verifyUri}
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color={theme.colors.muted}>2. Enter code:   </Text>
              <Text bold color="white" wrap="truncate-end">
                [ {userCode} ]
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color={theme.colors.muted}>
                3. Sign in with your @metateammyanmar.com account
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color={theme.colors.warning}>
                Waiting for Microsoft SSO authorization{dots}
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color={theme.colors.muted}>
                Press <Text bold>s</Text> to skip and work offline
              </Text>
            </Box>
          </Box>
        )}

        {loginState === "waiting" && !userCode && (
          <Box marginTop={1}>
            <Text color={theme.colors.warning}>
              Requesting device code from Microsoft{dots}
            </Text>
          </Box>
        )}

        {loginState === "no_secret" && (
          <Box flexDirection="column" marginTop={1}>
            <Text color={theme.colors.warning}>
              Microsoft SSO is not configured.
            </Text>
            <Box marginTop={1}>
              <Text color={theme.colors.muted}>
                Copy <Text bold>.env.example</Text> to <Text bold>.env</Text> and set{" "}
                <Text bold>MTC_AZURE_CLIENT_SECRET</Text> to enable SSO.
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text color={theme.colors.muted}>
                Press <Text bold>s</Text> or <Text bold>esc</Text> to continue in offline mode.
              </Text>
            </Box>
          </Box>
        )}

        {loginState === "error" && (
          <Box flexDirection="column" marginTop={1}>
            <Text color={theme.colors.error}>SSO Error: {errorMsg}</Text>
            <Box marginTop={1}>
              <Text color={theme.colors.muted}>
                Press <Text bold>r</Text> to retry,{" "}
                <Text bold>s</Text> to skip,{" "}
                <Text bold>q</Text> to quit
              </Text>
            </Box>
          </Box>
        )}

        {loginState === "init" && (
          <Box marginTop={1}>
            <Text color={theme.colors.muted}>Starting login...</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}