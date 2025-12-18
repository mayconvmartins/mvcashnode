import * as React from "react"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const inputVariants = cva(
    "flex w-full rounded-lg border bg-transparent transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "border-input shadow-sm focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-primary",
                ghost: "border-transparent hover:border-input focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring/30",
                filled: "border-transparent bg-muted/50 focus-visible:bg-transparent focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-primary",
            },
            inputSize: {
                sm: "h-8 px-2.5 text-xs",
                default: "h-10 px-3 text-sm",
                lg: "h-12 px-4 text-base",
            },
            state: {
                default: "",
                error: "border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive",
                success: "border-emerald-500 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500",
            }
        },
        defaultVariants: {
            variant: "default",
            inputSize: "default",
            state: "default",
        }
    }
)

export interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    error?: boolean
    success?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, variant, inputSize, state, leftIcon, rightIcon, error, success, ...props }, ref) => {
        const computedState = error ? 'error' : success ? 'success' : state

        return (
            <div className="relative">
                {leftIcon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        {leftIcon}
                    </div>
                )}
                <input
                    type={type}
                    className={cn(
                        inputVariants({ variant, inputSize, state: computedState }),
                        leftIcon && "pl-10",
                        rightIcon && "pr-10",
                        className
                    )}
                    ref={ref}
                    {...props}
                />
                {rightIcon && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {rightIcon}
                    </div>
                )}
            </div>
        )
    }
)
Input.displayName = "Input"

export { Input, inputVariants }
