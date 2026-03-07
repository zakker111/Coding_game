import React from 'react'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from './routes'

it('renders the landing page', () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })

  render(<RouterProvider router={router} />)

  expect(screen.getByRole('heading', { name: 'Nowt' })).toBeInTheDocument()
})

it('renders the docs page', () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/docs'] })

  render(<RouterProvider router={router} />)

  expect(screen.getByRole('heading', { name: 'Bot instructions' })).toBeInTheDocument()
  expect(screen.getByText(/Quick guide \+ full reference/i)).toBeInTheDocument()
})
