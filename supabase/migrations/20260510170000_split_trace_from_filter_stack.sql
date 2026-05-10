-- F21 — Split Filter vs Trace (PR 1 of 2 — strictly additive).
--
-- Adds the new `project_image_trace` table that holds the single
-- bitmap-to-vector artefact per project (numerate xor lineart).
-- The legacy `project_image_filters` stack still accepts numerate
-- and lineart rows for now — it will be narrowed in F21 PR 2 once
-- the editor UI has cut over to the Trace tab.
--
-- Verified safe (2026-05-10): SELECT count(*) FROM
-- public.project_image_filters returned 0 in the linked prod
-- project, so no data is at risk in the additive step.

-- 1. New table: one Trace per project.
CREATE TABLE IF NOT EXISTS public.project_image_trace (
    project_id      uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
    kind            text NOT NULL,
    params          jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_image_id uuid NOT NULL REFERENCES public.project_images(id) ON DELETE RESTRICT,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_image_trace_kind_ck CHECK (kind IN ('numerate', 'lineart'))
);

ALTER TABLE public.project_image_trace OWNER TO postgres;

ALTER TABLE public.project_image_trace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_image_trace_owner_select" ON public.project_image_trace
    FOR SELECT USING (project_id IN (
        SELECT projects.id FROM public.projects WHERE projects.owner_id = auth.uid()
    ));

CREATE POLICY "project_image_trace_owner_insert" ON public.project_image_trace
    FOR INSERT WITH CHECK (project_id IN (
        SELECT projects.id FROM public.projects WHERE projects.owner_id = auth.uid()
    ));

CREATE POLICY "project_image_trace_owner_update" ON public.project_image_trace
    FOR UPDATE USING (project_id IN (
        SELECT projects.id FROM public.projects WHERE projects.owner_id = auth.uid()
    )) WITH CHECK (project_id IN (
        SELECT projects.id FROM public.projects WHERE projects.owner_id = auth.uid()
    ));

CREATE POLICY "project_image_trace_owner_delete" ON public.project_image_trace
    FOR DELETE USING (project_id IN (
        SELECT projects.id FROM public.projects WHERE projects.owner_id = auth.uid()
    ));

CREATE OR REPLACE TRIGGER trg_project_image_trace_updated_at
    BEFORE UPDATE ON public.project_image_trace
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Grants — mirror project_image_filters defaults so service-role
-- and authenticated users have parity.
GRANT ALL ON TABLE public.project_image_trace TO anon;
GRANT ALL ON TABLE public.project_image_trace TO authenticated;
GRANT ALL ON TABLE public.project_image_trace TO service_role;
