export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      project_grid: {
        Row: {
          color: string
          created_at: string
          line_width_value: number
          project_id: string
          spacing_value: number
          spacing_x_value: number | null
          spacing_y_value: number | null
          unit: Database["public"]["Enums"]["measure_unit"]
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          line_width_value: number
          project_id: string
          spacing_value: number
          spacing_x_value?: number | null
          spacing_y_value?: number | null
          unit?: Database["public"]["Enums"]["measure_unit"]
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          line_width_value?: number
          project_id?: string
          spacing_value?: number
          spacing_x_value?: number | null
          spacing_y_value?: number | null
          unit?: Database["public"]["Enums"]["measure_unit"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_grid_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_image_state: {
        Row: {
          created_at: string
          dpi: number | null
          height_px: number | null
          height_px_u: string | null
          image_id: string | null
          project_id: string
          role: Database["public"]["Enums"]["image_role"]
          rotation_deg: number
          scale_x: number
          scale_y: number
          unit: Database["public"]["Enums"]["measure_unit"] | null
          updated_at: string
          width_px: number | null
          width_px_u: string | null
          x: number
          x_px_u: string | null
          y: number
          y_px_u: string | null
        }
        Insert: {
          created_at?: string
          dpi?: number | null
          height_px?: number | null
          height_px_u?: string | null
          image_id?: string | null
          project_id: string
          role: Database["public"]["Enums"]["image_role"]
          rotation_deg?: number
          scale_x?: number
          scale_y?: number
          unit?: Database["public"]["Enums"]["measure_unit"] | null
          updated_at?: string
          width_px?: number | null
          width_px_u?: string | null
          x?: number
          x_px_u?: string | null
          y?: number
          y_px_u?: string | null
        }
        Update: {
          created_at?: string
          dpi?: number | null
          height_px?: number | null
          height_px_u?: string | null
          image_id?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["image_role"]
          rotation_deg?: number
          scale_x?: number
          scale_y?: number
          unit?: Database["public"]["Enums"]["measure_unit"] | null
          updated_at?: string
          width_px?: number | null
          width_px_u?: string | null
          x?: number
          x_px_u?: string | null
          y?: number
          y_px_u?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_image_state_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "project_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_image_state_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_images: {
        Row: {
          bit_depth: number | null
          created_at: string
          dpi: number | null
          file_size_bytes: number
          format: string
          height_px: number
          id: string
          name: string
          project_id: string
          role: Database["public"]["Enums"]["image_role"]
          storage_path: string
          updated_at: string
          width_px: number
        }
        Insert: {
          bit_depth?: number | null
          created_at?: string
          dpi?: number | null
          file_size_bytes?: number
          format: string
          height_px: number
          id?: string
          name: string
          project_id: string
          role: Database["public"]["Enums"]["image_role"]
          storage_path: string
          updated_at?: string
          width_px: number
        }
        Update: {
          bit_depth?: number | null
          created_at?: string
          dpi?: number | null
          file_size_bytes?: number
          format?: string
          height_px?: number
          id?: string
          name?: string
          project_id?: string
          role?: Database["public"]["Enums"]["image_role"]
          storage_path?: string
          updated_at?: string
          width_px?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_pdfs: {
        Row: {
          created_at: string
          filename: string
          id: string
          output_dpi_x: number
          output_dpi_y: number
          output_line_width_unit: Database["public"]["Enums"]["measure_unit"]
          output_line_width_value: number
          pdf_format: string
          project_id: string
          sequence_number: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          output_dpi_x: number
          output_dpi_y: number
          output_line_width_unit?: Database["public"]["Enums"]["measure_unit"]
          output_line_width_value: number
          pdf_format: string
          project_id: string
          sequence_number: number
          storage_path: string
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          output_dpi_x?: number
          output_dpi_y?: number
          output_line_width_unit?: Database["public"]["Enums"]["measure_unit"]
          output_line_width_value?: number
          pdf_format?: string
          project_id?: string
          sequence_number?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_pdfs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_vectorization_settings: {
        Row: {
          created_at: string
          num_colors: number
          output_height_px: number
          output_width_px: number
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          num_colors: number
          output_height_px: number
          output_width_px: number
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          num_colors?: number
          output_height_px?: number
          output_width_px?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_vectorization_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_workspace: {
        Row: {
          background_color: string
          background_opacity: number
          created_at: string
          dpi_x: number
          dpi_y: number
          output_dpi_x: number
          output_dpi_y: number
          height_px: number
          height_px_u: string
          height_value: number
          page_bg_color: string
          page_bg_enabled: boolean
          page_bg_opacity: number
          project_id: string
          raster_effects_preset: string | null
          unit: Database["public"]["Enums"]["measure_unit"]
          updated_at: string
          width_px: number
          width_px_u: string
          width_value: number
        }
        Insert: {
          background_color?: string
          background_opacity?: number
          created_at?: string
          dpi_x: number
          dpi_y: number
          output_dpi_x: number
          output_dpi_y: number
          height_px: number
          height_px_u: string
          height_value: number
          page_bg_color?: string
          page_bg_enabled?: boolean
          page_bg_opacity?: number
          project_id: string
          raster_effects_preset?: string | null
          unit?: Database["public"]["Enums"]["measure_unit"]
          updated_at?: string
          width_px: number
          width_px_u: string
          width_value: number
        }
        Update: {
          background_color?: string
          background_opacity?: number
          created_at?: string
          dpi_x?: number
          dpi_y?: number
          output_dpi_x?: number
          output_dpi_y?: number
          height_px?: number
          height_px_u?: string
          height_value?: number
          page_bg_color?: string
          page_bg_enabled?: boolean
          page_bg_opacity?: number
          project_id?: string
          raster_effects_preset?: string | null
          unit?: Database["public"]["Enums"]["measure_unit"]
          updated_at?: string
          width_px?: number
          width_px_u?: string
          width_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_workspace_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: []
      }
      schema_migrations: {
        Row: {
          applied_at: string
          checksum_sha256: string
          filename: string
          id: number
        }
        Insert: {
          applied_at?: string
          checksum_sha256: string
          filename: string
          id?: number
        }
        Update: {
          applied_at?: string
          checksum_sha256?: string
          filename?: string
          id?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      set_active_master_image: {
        Args: {
          p_image_id: string
          p_project_id: string
        }
        Returns: undefined
      }
      set_active_master_latest: {
        Args: {
          p_project_id: string
        }
        Returns: undefined
      }
      set_active_master_with_state: {
        Args: {
          p_height_px: number
          p_image_id: string
          p_project_id: string
          p_width_px: number
        }
        Returns: undefined
      }
      workspace_value_to_px_u: {
        Args: {
          dpi: number
          u: Database["public"]["Enums"]["measure_unit"]
          v: number
        }
        Returns: number
      }
    }
    Enums: {
      image_role: "master" | "working"
      measure_unit: "mm" | "cm" | "pt" | "px"
      project_status: "in_progress" | "completed" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      image_role: ["master", "working"],
      measure_unit: ["mm", "cm", "pt", "px"],
      project_status: ["in_progress", "completed", "archived"],
    },
  },
} as const
