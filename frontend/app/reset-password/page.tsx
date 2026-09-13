import { getDictionary } from "@/utils/i18n/server";
import { ResetPasswordForm } from "./reset-form";

// A Server Component wrapping a Client one, purely so the words can be looked
// up where the locale cookie is readable. The form itself has to stay on the
// client: the recovery link carries its session tokens in the URL fragment,
// which never reaches the server.
export default async function ResetPasswordPage() {
  const { t } = await getDictionary();

  return (
    <ResetPasswordForm
      labels={{
        checkingTitle: t.reset.checkingTitle,
        checkingLead: t.reset.checkingLead,
        invalidTitle: t.reset.invalidTitle,
        invalidLead: t.reset.invalidLead,
        requestNewLink: t.reset.requestNewLink,
        doneTitle: t.reset.doneTitle,
        doneLead: t.reset.doneLead,
        title: t.reset.title,
        lead: t.reset.lead,
        newPassword: t.auth.newPassword,
        saveButton: t.reset.saveButton,
        updateFailed: t.reset.updateFailed,
        showPassword: t.auth.showPassword,
        hidePassword: t.auth.hidePassword,
      }}
    />
  );
}
