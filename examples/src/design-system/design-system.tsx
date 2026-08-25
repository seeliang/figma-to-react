import { ButtonGhost } from './button-ghost.js'
import { ButtonPrimary } from './button-primary.js'
import { ButtonSecondary } from './button-secondary.js'
import { FormField } from './form-field.js'
import { InputFieldDefault } from './input-field-default.js'
import { InputFieldError } from './input-field-error.js'
import { InputFieldFocused } from './input-field-focused.js'

export function DesignSystem() {
  return (
    <div className="relative w-[1763px] h-[751px] bg-[#444444] border border-[rgba(255,255,255,0.1)]">
      <div className="flex gap-6 absolute left-[40px] top-[60px] w-fit h-fit p-6 bg-neutral-50 rounded-xl overflow-hidden">
        <div className="h-11">
          <InputFieldDefault placeholderText="Placeholder text" />
        </div>
        <div className="h-11">
          <InputFieldFocused inputValue="Input value" />
        </div>
        <div className="h-11">
          <InputFieldError invalidInput="Invalid input" />
        </div>
      </div>
      <div className="flex gap-6 absolute left-[547px] top-[60px] w-fit h-fit p-6 bg-neutral-50 rounded-xl overflow-hidden">
        <div className="w-90 h-[46px]">
          <ButtonPrimary buttonLabel="Button Label" />
        </div>
        <div className="w-90 h-[46px]">
          <ButtonSecondary buttonLabel="Button Label" />
        </div>
        <div className="w-90 h-[46px]">
          <ButtonGhost buttonLabel="Button Label" />
        </div>
      </div>
      <div className="absolute left-[40px] top-[192px] w-90 h-fit">
        <FormField label="Label" placeholderText="Placeholder text" />
      </div>
      <div className="flex flex-col gap-4 absolute left-[40px] top-[260px] w-fit h-fit p-6 bg-white rounded-xl overflow-hidden">
        <p className="font-inter text-[16px] font-semibold text-slate-950">Color Palette</p>
        <p className="font-inter text-[12px] font-medium tracking-[0.48px] text-slate-600">
          PRIMARY
        </p>
        <div className="flex gap-3 overflow-hidden">
          <div className="flex flex-col gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-blue-600" />
            <p className="font-inter text-[11px] font-medium text-slate-950">Primary</p>
            <p className="font-inter text-[10px] text-slate-600">#2563EB</p>
          </div>
          <div className="flex flex-col gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-white border border-blue-200" />
            <p className="font-inter text-[11px] font-medium text-slate-950">Primary Foreground</p>
            <p className="font-inter text-[10px] text-slate-600">#FFFFFF</p>
          </div>
        </div>
        <p className="font-inter text-[12px] font-medium tracking-[0.48px] text-slate-600">
          NEUTRALS
        </p>
        <div className="flex gap-3 overflow-hidden">
          <div className="flex flex-col gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-slate-950" />
            <p className="font-inter text-[11px] font-medium text-slate-950">Foreground</p>
            <p className="font-inter text-[10px] text-slate-600">#0F172A</p>
          </div>
          <div className="flex flex-col gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-slate-600" />
            <p className="font-inter text-[11px] font-medium text-slate-950">Muted</p>
            <p className="font-inter text-[10px] text-slate-600">#64748B</p>
          </div>
          <div className="flex flex-col gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-slate-400" />
            <p className="font-inter text-[11px] font-medium text-slate-950">Placeholder</p>
            <p className="font-inter text-[10px] text-slate-600">#94A3B8</p>
          </div>
          <div className="flex flex-col gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-blue-200" />
            <p className="font-inter text-[11px] font-medium text-slate-950">Border</p>
            <p className="font-inter text-[10px] text-slate-600">#E2E8F0</p>
          </div>
          <div className="flex flex-col gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-neutral-50" />
            <p className="font-inter text-[11px] font-medium text-slate-950">Surface</p>
            <p className="font-inter text-[10px] text-slate-600">#F8FAFC</p>
          </div>
          <div className="flex flex-col gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-white border border-blue-200" />
            <p className="font-inter text-[11px] font-medium text-slate-950">Background</p>
            <p className="font-inter text-[10px] text-slate-600">#FFFFFF</p>
          </div>
        </div>
        <p className="font-inter text-[12px] font-medium tracking-[0.48px] text-slate-600">
          SEMANTIC
        </p>
        <div className="flex gap-3 overflow-hidden">
          <div className="flex flex-col gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-[#ef4444]" />
            <p className="font-inter text-[11px] font-medium text-slate-950">Error</p>
            <p className="font-inter text-[10px] text-slate-600">#EF4444</p>
          </div>
          <div className="flex flex-col gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-[#22c55e]" />
            <p className="font-inter text-[11px] font-medium text-slate-950">Success</p>
            <p className="font-inter text-[10px] text-slate-600">#22C55E</p>
          </div>
          <div className="flex flex-col gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-[#f59e0b]" />
            <p className="font-inter text-[11px] font-medium text-slate-950">Warning</p>
            <p className="font-inter text-[10px] text-slate-600">#F59E0B</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-5 absolute left-[507px] top-[260px] w-[520px] h-fit p-6 bg-white rounded-xl overflow-hidden">
        <p className="font-inter text-[16px] font-semibold text-slate-950">Typography Scale</p>
        <div className="flex items-center gap-6 self-stretch overflow-hidden">
          <div className="flex flex-col gap-[2px] w-30 overflow-hidden">
            <p className="font-inter text-[11px] font-medium text-slate-950">Title</p>
            <p className="font-inter text-[10px] text-slate-600">Inter Bold / 28px / 34px</p>
          </div>
          <h2 className="font-inter text-[28px] leading-[34px] font-bold text-slate-950">
            Create Account
          </h2>
        </div>
        <div className="flex items-center gap-6 self-stretch overflow-hidden">
          <div className="flex flex-col gap-[2px] w-30 overflow-hidden">
            <p className="font-inter text-[11px] font-medium text-slate-950">Subtitle</p>
            <p className="font-inter text-[10px] text-slate-600">Inter Regular / 14px / 20px</p>
          </div>
          <p className="font-inter text-[14px] leading-[20px] text-slate-950">
            Sign up in seconds to start building.
          </p>
        </div>
        <div className="flex items-center gap-6 self-stretch overflow-hidden">
          <div className="flex flex-col gap-[2px] w-30 overflow-hidden">
            <p className="font-inter text-[11px] font-medium text-slate-950">Label</p>
            <p className="font-inter text-[10px] text-slate-600">Inter Medium / 13px / 16px</p>
          </div>
          <p className="font-inter text-[13px] leading-[16px] font-medium text-slate-950">
            Full Name
          </p>
        </div>
        <div className="flex items-center gap-6 self-stretch overflow-hidden">
          <div className="flex flex-col gap-[2px] w-30 overflow-hidden">
            <p className="font-inter text-[11px] font-medium text-slate-950">Input Text</p>
            <p className="font-inter text-[10px] text-slate-600">Inter Regular / 14px / 17px</p>
          </div>
          <p className="font-inter text-[14px] leading-[17px] text-slate-950">you@example.com</p>
        </div>
        <div className="flex items-center gap-6 self-stretch overflow-hidden">
          <div className="flex flex-col gap-[2px] w-30 overflow-hidden">
            <p className="font-inter text-[11px] font-medium text-slate-950">Button</p>
            <p className="font-inter text-[10px] text-slate-600">Inter Semi Bold / 14px / 17px</p>
          </div>
          <p className="font-inter text-[14px] leading-[17px] font-semibold text-slate-950">
            Sign Up
          </p>
        </div>
        <div className="flex items-center gap-6 self-stretch overflow-hidden">
          <div className="flex flex-col gap-[2px] w-30 overflow-hidden">
            <p className="font-inter text-[11px] font-medium text-slate-950">Link</p>
            <p className="font-inter text-[10px] text-slate-600">Inter Regular / 14px / 17px</p>
          </div>
          <p className="font-inter text-[14px] leading-[17px] text-blue-600">
            Already have an account? Log in
          </p>
        </div>
      </div>
    </div>
  )
}
