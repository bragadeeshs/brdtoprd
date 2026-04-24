import React from 'react'
import { SignIn } from '@clerk/clerk-react'

/** Hosts Clerk's <SignIn> widget. Path-based routing so /sign-in/factor-one
 *  etc resolve correctly. signUpUrl points to our local /sign-up route. */
export default function SignInPage() {
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
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </div>
  )
}
