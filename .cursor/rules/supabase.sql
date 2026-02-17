-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.project_filter_settings (
  project_id uuid NOT NULL,
  target_cols integer NOT NULL CHECK (target_cols > 0),
  target_rows integer NOT NULL CHECK (target_rows > 0),
  max_colors integer NOT NULL CHECK (max_colors >= 1 AND max_colors <= 1000),
  dither boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_filter_settings_pkey PRIMARY KEY (project_id),
  CONSTRAINT project_filter_settings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.project_generation (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE,
  cols integer NOT NULL CHECK (cols > 0),
  rows integer NOT NULL CHECK (rows > 0),
  palette jsonb NOT NULL DEFAULT '[]'::jsonb,
  cell_labels ARRAY NOT NULL,
  render_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_generation_pkey PRIMARY KEY (id),
  CONSTRAINT project_generation_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.project_grid (
  project_id uuid NOT NULL,
  color text NOT NULL,
  spacing_value numeric NOT NULL CHECK (spacing_value > 0::numeric),
  line_width_value numeric NOT NULL CHECK (line_width_value > 0::numeric),
  unit USER-DEFINED NOT NULL DEFAULT 'mm'::measure_unit,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  spacing_x_value numeric CHECK (spacing_x_value IS NULL OR spacing_x_value > 0::numeric),
  spacing_y_value numeric CHECK (spacing_y_value IS NULL OR spacing_y_value > 0::numeric),
  CONSTRAINT project_grid_pkey PRIMARY KEY (project_id),
  CONSTRAINT project_grid_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.project_image_state (
  project_id uuid NOT NULL,
  role USER-DEFINED NOT NULL,
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  scale_x numeric NOT NULL DEFAULT 1 CHECK (scale_x > 0::numeric),
  scale_y numeric NOT NULL DEFAULT 1 CHECK (scale_y > 0::numeric),
  rotation_deg integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  width_px numeric CHECK (width_px IS NULL OR width_px > 0::numeric),
  height_px numeric CHECK (height_px IS NULL OR height_px > 0::numeric),
  unit USER-DEFINED,
  dpi numeric CHECK (dpi IS NULL OR dpi > 0::numeric),
  width_px_u text,
  height_px_u text,
  x_px_u text,
  y_px_u text,
  image_id uuid,
  CONSTRAINT project_image_state_pkey PRIMARY KEY (project_id, role),
  CONSTRAINT project_image_state_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT project_image_state_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.project_images(id)
);
CREATE TABLE public.project_images (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  role USER-DEFINED NOT NULL,
  name text NOT NULL,
  format text NOT NULL,
  width_px integer NOT NULL CHECK (width_px > 0),
  height_px integer NOT NULL CHECK (height_px > 0),
  bit_depth integer,
  storage_path text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  storage_bucket text NOT NULL DEFAULT 'project_images'::text,
  is_active boolean NOT NULL DEFAULT false,
  deleted_at timestamp with time zone,
  color_space USER-DEFINED,
  file_size_bytes bigint NOT NULL DEFAULT 0 CHECK (file_size_bytes >= 0),
  dpi numeric NOT NULL CHECK (dpi > 0::numeric),
  CONSTRAINT project_images_pkey PRIMARY KEY (id),
  CONSTRAINT project_images_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.project_pdfs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  filename text NOT NULL,
  storage_path text NOT NULL,
  pdf_format text NOT NULL,
  output_dpi_x numeric NOT NULL CHECK (output_dpi_x > 0::numeric),
  output_dpi_y numeric NOT NULL CHECK (output_dpi_y > 0::numeric),
  output_line_width_value numeric NOT NULL CHECK (output_line_width_value > 0::numeric),
  output_line_width_unit USER-DEFINED NOT NULL DEFAULT 'mm'::measure_unit,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  generation_id uuid,
  CONSTRAINT project_pdfs_pkey PRIMARY KEY (id),
  CONSTRAINT project_pdfs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT project_pdfs_generation_id_fkey FOREIGN KEY (generation_id) REFERENCES public.project_generation(id)
);
CREATE TABLE public.project_vectorization_settings (
  project_id uuid NOT NULL,
  num_colors integer NOT NULL CHECK (num_colors >= 1 AND num_colors <= 1000),
  output_width_px integer NOT NULL CHECK (output_width_px > 0),
  output_height_px integer NOT NULL CHECK (output_height_px > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_vectorization_settings_pkey PRIMARY KEY (project_id),
  CONSTRAINT project_vectorization_settings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.project_workspace (
  project_id uuid NOT NULL,
  unit USER-DEFINED NOT NULL DEFAULT 'mm'::measure_unit,
  width_value numeric NOT NULL CHECK (width_value > 0::numeric),
  height_value numeric NOT NULL CHECK (height_value > 0::numeric),
  dpi_x numeric NOT NULL CHECK (dpi_x > 0::numeric),
  dpi_y numeric NOT NULL CHECK (dpi_y > 0::numeric),
  output_dpi_x numeric NOT NULL DEFAULT 300 CHECK (output_dpi_x > 0::numeric),
  output_dpi_y numeric NOT NULL DEFAULT 300 CHECK (output_dpi_y > 0::numeric),
  width_px_u text NOT NULL CHECK (width_px_u::bigint >= 1000000 AND width_px_u::bigint <= '32768000000'::bigint),
  height_px_u text NOT NULL CHECK (height_px_u::bigint >= 1000000 AND height_px_u::bigint <= '32768000000'::bigint),
  width_px integer NOT NULL CHECK (width_px > 0),
  height_px integer NOT NULL CHECK (height_px > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  raster_effects_preset text CHECK (raster_effects_preset IS NULL OR (raster_effects_preset = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
  page_bg_enabled boolean NOT NULL DEFAULT false,
  page_bg_color text NOT NULL DEFAULT '#ffffff'::text CHECK (page_bg_color ~ '^#([0-9a-fA-F]{6})$'::text),
  page_bg_opacity integer NOT NULL DEFAULT 50 CHECK (page_bg_opacity >= 0 AND page_bg_opacity <= 100),
  CONSTRAINT project_workspace_pkey PRIMARY KEY (project_id),
  CONSTRAINT project_workspace_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'in_progress'::project_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  workflow_step USER-DEFINED NOT NULL DEFAULT 'image'::workflow_step,
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id)
);
CREATE TABLE public.schema_migrations (
  id bigint NOT NULL DEFAULT nextval('schema_migrations_id_seq'::regclass),
  filename text NOT NULL UNIQUE,
  checksum_sha256 text NOT NULL,
  applied_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT schema_migrations_pkey PRIMARY KEY (id)
);