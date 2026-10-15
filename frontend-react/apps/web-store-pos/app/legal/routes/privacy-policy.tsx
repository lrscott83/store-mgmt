import { Card } from '~/shared/components/ui/card';
import { LegalDocument } from '../components/legal-document';
import { PRIVACY_POLICY_MARKDOWN } from '../lib/legal-content.generated';

/**
 * Políticas de Privacidad — página PÚBLICA (montada en `public-app-layout`, sin
 * guard: el footer la enlaza también desde el layout de invitado). El contenido
 * NO se escribe aquí: se genera desde `docs/legal/politica-de-privacidad.md`
 * con `pnpm --filter @store-mgmt/web-store-pos generate:legal`.
 */
export function PrivacyPolicyPage() {
  return (
    <div className="space-y-4 p-4">
      <Card>
        <LegalDocument markdown={PRIVACY_POLICY_MARKDOWN} testId="privacy-policy-document" />
      </Card>
    </div>
  );
}

export default PrivacyPolicyPage;
