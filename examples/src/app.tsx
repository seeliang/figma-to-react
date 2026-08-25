import { ButtonGhost } from './design-system/button-ghost.js'
import { ButtonPrimary } from './design-system/button-primary.js'
import { ButtonSecondary } from './design-system/button-secondary.js'
import { FormField } from './design-system/form-field.js'
import { InputFieldDefault } from './design-system/input-field-default.js'
import { InputFieldError } from './design-system/input-field-error.js'
import { InputFieldFocused } from './design-system/input-field-focused.js'
import { DesignSystem } from './design-system/design-system.js'
import { Card } from './generated/card.js'

/**
 * Renders generated components next to the Figma frames they came from. This is
 * the only check that catches "compiles, types fine, looks wrong".
 */
export function App() {
  return (
    <main className="min-h-screen bg-neutral-100 p-12 flex flex-col gap-12">
      <Section title="Buttons — from design-system-sample">
        <ButtonPrimary />
        <ButtonSecondary />
        <ButtonGhost />
      </Section>

      <Section title="Input fields — each variant its own component">
        <InputFieldDefault />
        <InputFieldFocused />
        <InputFieldError />
      </Section>

      <Section title="Form field — composes InputFieldDefault, prop threaded through">
        <FormField />
        <FormField label="Email" placeholderText="you@example.com" />
      </Section>

      <Section title="Whole frame — colour swatches must be circles, not squares">
        <div className="origin-top-left scale-[0.55]">
          <DesignSystem />
        </div>
      </Section>

      <Section title="Card — from the test fixture, no token needed">
        <Card />
        <Card title="Quarterly report" body="Churn fell to 1.8%." label="Open" />
      </Section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{title}</h2>
      <div className="flex flex-wrap items-start gap-6 rounded-xl bg-white p-6">{children}</div>
    </section>
  )
}
