/* M0.1.2 — first frontend test, intentionally tight.
 *
 * Goal: prove the testing pipeline works (jsdom + RTL + Vitest) without
 * trying to render <App /> (which needs Clerk + Router + Toast providers
 * — we'll mock those once we have a real component-under-test that needs
 * them). The Editable primitives are the right first target: they're the
 * foundation of M4.1 inline editing, no external deps, used everywhere.
 *
 * If this test goes red, M4.1 across the studio is broken — high-leverage
 * smoke for ~30 lines of test.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditableText } from '../components/Editable.jsx'

describe('EditableText', () => {
  it('renders the value as a click target by default', () => {
    render(<EditableText value="hello" onSave={() => {}} />)
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByText('hello')).toHaveAttribute('role', 'button')
  })

  it('shows placeholder when value is empty', () => {
    render(<EditableText value="" placeholder="Type here" onSave={() => {}} />)
    expect(screen.getByText('Type here')).toBeInTheDocument()
  })

  it('clicking switches to an input and saves on Enter', async () => {
    const onSave = vi.fn()
    render(<EditableText value="old" onSave={onSave} />)

    fireEvent.click(screen.getByText('old'))
    const input = await screen.findByDisplayValue('old')
    fireEvent.change(input, { target: { value: 'new' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSave).toHaveBeenCalledWith('new')
  })

  it('Escape discards the edit without firing onSave', async () => {
    const onSave = vi.fn()
    render(<EditableText value="old" onSave={onSave} />)

    fireEvent.click(screen.getByText('old'))
    const input = await screen.findByDisplayValue('old')
    fireEvent.change(input, { target: { value: 'changed' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onSave).not.toHaveBeenCalled()
  })
})
