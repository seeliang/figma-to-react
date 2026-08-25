import { setProjectAnnotations } from '@storybook/react-vite'
import { beforeAll } from 'vitest'
import preview from './preview'

/**
 * Applies the preview's annotations — decorators, parameters, and the global
 * stylesheet — to stories run as tests. Without them the stories render
 * unstyled here and the fidelity assertions measure browser defaults.
 *
 * Storybook reports this call as redundant in 10.5. It is not: omitting it
 * routes the runner through `setup-file-with-project-annotations`, which fails
 * to import `aria-query` under Vite's dep optimiser and takes every story file
 * down with it.
 */
const annotations = setProjectAnnotations([preview])

beforeAll(annotations.beforeAll)
