import { Card } from './generated/card.js'

/**
 * Renders the generated components side by side with the Figma frame they came
 * from. This is the only check that catches "compiles, types fine, looks wrong".
 */
export function App() {
  return (
    <main className="min-h-screen bg-neutral-100 p-12">
      <h1 className="mb-8 text-2xl font-semibold text-neutral-900">Generated output</h1>
      <div className="flex flex-wrap items-start gap-8">
        <Card />
        <Card title="Quarterly report" body="Churn fell to 1.8%." label="Open" />
      </div>
    </main>
  )
}
