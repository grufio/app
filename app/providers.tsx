"use client"

/**
 * App providers (client-side).
 *
 * Responsibilities:
 * - Provide the global MUI theme (standard MUI approach).
 */
import * as React from "react"
import { ThemeProvider, createTheme } from "@mui/material/styles"
import { ChevronDown, ChevronRight } from "lucide-react"

// Enable MUI X Tree View theme keys on `createTheme({ components: ... })`.
import type {} from "@mui/x-tree-view/themeAugmentation"

const theme = createTheme({
  components: {
    MuiTreeItem: {
      defaultProps: {
        // Put caret icons on the TreeItem level so they stay active even when RichTreeView `slots`
        // is provided (e.g. to override only `item`).
        slots: {
          expandIcon: () => <ChevronRight aria-hidden="true" size={16} strokeWidth={1} />,
          collapseIcon: () => <ChevronDown aria-hidden="true" size={16} strokeWidth={1} />,
        },
      },
      styleOverrides: {
        content: {
          display: "flex",
          alignItems: "center",
          fontSize: "12px",
        },
        label: {
          fontSize: "12px",
          lineHeight: 1,
        },
        iconContainer: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 24,
          height: 24,
        },
      },
    },
  },
})

export function Providers(props: { children: React.ReactNode }) {
  return <ThemeProvider theme={theme}>{props.children}</ThemeProvider>
}

