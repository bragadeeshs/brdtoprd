import React from 'react'
import { SignUp } from '@clerk/clerk-react'

export default function SignUpPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg)',
        padding: 24,
      }}
    >
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </div>
  )
}
