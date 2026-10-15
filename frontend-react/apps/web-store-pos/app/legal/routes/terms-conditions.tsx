import { Card } from '~/shared/components/ui/card';
import { LegalDocument } from '../components/legal-document';
import { TERMS_AND_CONDITIONS_MARKDOWN } from '../lib/legal-content.generated';

/**
 * Términos y Condiciones — página PÚBLICA (montada en `public-app-layout`, sin
 * guard: el register y el footer la enlazan). El contenido NO se escribe aquí:
 * se genera desde `docs/legal/terminos-y-condiciones.md` con
 * `pnpm --filter @store-mgmt/web-store-pos generate:legal`.
 */
export function TermsConditionsPage() {
  return (
    <div className="space-y-4 p-4">
      <Card>
        <LegalDocument
          markdown={TERMS_AND_CONDITIONS_MARKDOWN}
          testId="terms-conditions-document"
        />
      </Card>
    </div>
  );
}

export default TermsConditionsPage;
