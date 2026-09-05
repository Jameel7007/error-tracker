import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './lib/storage'

describe('App', () => {
  beforeEach(() => localStorage.clear())

  it('loads demo data on first run and shows insights for the first student', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /Luana/ })).toHaveAttribute('aria-current', 'true')
    const insights = screen.getByRole('complementary', { name: 'Insights' })
    expect(within(insights).getByText('present perfect vs present simple')).toBeInTheDocument()
  })

  it('stays empty after "Clear all" and a reload instead of reseeding demo data', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, students: [], errors: [] }))
    render(<App />)
    expect(screen.getByText('No students yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load demo data' })).toBeInTheDocument()
  })

  it('adds a student and logs an error, which persists to localStorage', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('New student name'), { target: { value: 'Test Student' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add student' }))
    fireEvent.click(screen.getByRole('button', { name: /Test Student/ }))

    fireEvent.change(screen.getByLabelText('What they said'), { target: { value: 'She go home' } })
    fireEvent.change(screen.getByLabelText('Correction'), { target: { value: 'She goes home' } })
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'third person -s' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save error' }))

    const log = screen.getByRole('region', { name: 'Error log' })
    expect(within(log).getByText('She goes home')).toBeInTheDocument()
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.errors.some((e: { correction: string }) => e.correction === 'She goes home')).toBe(true)
  })

  it('filters the log when a tag is picked in insights', () => {
    render(<App />)
    const insights = screen.getByRole('complementary', { name: 'Insights' })
    fireEvent.click(within(insights).getByRole('button', { name: /present perfect vs present simple/ }))
    const log = screen.getByRole('region', { name: 'Error log' })
    expect(within(log).queryByText('I am 25 years old.')).not.toBeInTheDocument()
    expect(within(log).getAllByText('present perfect vs present simple').length).toBeGreaterThan(1)
  })
})
