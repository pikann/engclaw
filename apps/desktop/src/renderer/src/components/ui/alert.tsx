import * as React from 'react'
import { cn } from '@/lib/utils'

function Alert({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="alert"
      data-slot="alert"
      className={cn('rounded-md border border-border p-3 text-sm', className)}
      {...props}
    />
  )
}

export { Alert }
