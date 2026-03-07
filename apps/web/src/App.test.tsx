import React from 'react'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from './routes'

it('renders the landing page', () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })

  render(<RouterProvider router={router} />)

  expect(screen.getByRole('heading', { name: 'Nowt' })).toBeInTheDocument()
})
