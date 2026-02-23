# Lock Guard Matrix

This matrix documents server-authoritative lock enforcement for image-mutating operations.

| path_or_symbol | mutation_type | lock_guard_present | error_contract | owner | status | evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `app/api/projects/[projectId]/image-state/route.ts#POST` | persist transform state | yes | `409/lock_conflict/image_locked` | editor-api | done | `test:lib/api/route-lock-guards.test.ts` |
| `services/editor/server/crop-image.ts#cropImageAndActivate` | create crop variant | yes | `409/lock_conflict/image_locked` | editor-server | done | `test:services/editor/server/crop-image.test.ts` |
| `app/api/projects/[projectId]/images/crop/route.ts#POST` | crop endpoint contract | yes (delegated) | `409/lock_conflict/image_locked` | editor-api | done | `test:services/editor/server/crop-image.test.ts` |
| `lib/supabase/project-images.ts#activateMasterWithState` | active image switch RPC wrapper | yes | `409/lock_conflict/image_locked` | data-access | done | `test:lib/supabase/project-images.test.ts` |
| `app/api/projects/[projectId]/images/master/restore/route.ts#POST` | restore initial master | yes | `409/lock_conflict/image_locked` | editor-api | done | `manual:docs/runbooks/optimization-sprint-2-rollout.md#post-deploy-verification-checklist` |
| `app/api/projects/[projectId]/images/master/[imageId]/route.ts#DELETE` | delete image | yes | `409/lock_conflict/image_locked` | editor-api | done | `manual:docs/runbooks/optimization-sprint-2-rollout.md#post-deploy-verification-checklist` |
| `services/editor/server/master-image-upload.ts#uploadMasterImage` | upload + active switch | yes | `409/lock_conflict/image_locked` | editor-server | done | `test:services/editor/server/master-image-upload.test.ts` |
| `app/api/projects/[projectId]/images/master/[imageId]/lock/route.ts#PATCH` | lock/unlock toggle | n/a (state authority) | `403/rls_denied/project_access`, `404/lock_query` | editor-api | done | `test:lib/api/route-lock-guards.test.ts` |

## Notes

- UI preemptive disable remains unchanged; server-side checks are authoritative.
- Every `done` row references at least one test or manual verification artifact.
