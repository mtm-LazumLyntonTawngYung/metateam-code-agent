import React from 'react';
import { Box, Text } from 'ink';

interface AppLayoutProps {
  children: React.ReactNode;
  sidebarComponent: React.ReactNode;
  footerLeft?: string;
  footerRight?: string;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  sidebarComponent,
  footerLeft,
  footerRight,
}) => {
  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="row" flexGrow={1} width="100%">
        <Box flexDirection="column" flexGrow={1} flexBasis={0} paddingRight={1}>
          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {children}
          </Box>
        </Box>
        {sidebarComponent}
      </Box>
      <Box
        justifyContent="space-between"
        marginTop={1}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
      >
        <Text color="gray">{footerLeft ?? ''}</Text>
        <Text color="gray">{footerRight ?? ''}</Text>
      </Box>
    </Box>
  );
};