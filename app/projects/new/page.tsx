import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export default async function NewProjectPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name: "Untitled",
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    redirect("/dashboard")
  }

  redirect(`/projects/${data.id}`)
}

