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
      <div className="flex items-start gap-6 absolute left-[40px] top-[60px] w-fit h-fit p-6 bg-neutral-50 rounded-xl overflow-hidden">
        <div className="h-11" data-figma-id="2:59">
          <InputFieldDefault placeholderText="Placeholder text" />
        </div>
        <div className="h-11" data-figma-id="2:61">
          <InputFieldFocused inputValue="Input value" />
        </div>
        <div className="h-11" data-figma-id="2:63">
          <InputFieldError invalidInput="Invalid input" />
        </div>
      </div>
      <div className="flex items-start gap-6 absolute left-[547px] top-[60px] w-fit h-fit p-6 bg-neutral-50 rounded-xl overflow-hidden">
        <div className="w-90 h-[46px]" data-figma-id="2:66">
          <ButtonPrimary buttonLabel="Button Label" />
        </div>
        <div className="w-90 h-[46px]" data-figma-id="2:68">
          <ButtonSecondary buttonLabel="Button Label" />
        </div>
        <div className="w-90 h-[46px]" data-figma-id="2:70">
          <ButtonGhost buttonLabel="Button Label" />
        </div>
      </div>
      <div className="absolute left-[40px] top-[192px] w-90 h-fit" data-figma-id="2:73">
        <FormField label="Label" placeholderText="Placeholder text" />
      </div>
      <div className="flex flex-col items-start gap-4 absolute left-[40px] top-[260px] w-fit h-fit p-6 bg-white rounded-xl overflow-hidden">
        <p
          className="w-max font-inter text-[16px] leading-[19.36px] font-semibold text-slate-950"
          data-figma-id="4:4"
        >
          Color Palette
        </p>
        <p
          className="w-max font-inter text-[12px] leading-[14.52px] font-medium tracking-[0.48px] text-slate-600"
          data-figma-id="4:5"
        >
          PRIMARY
        </p>
        <div className="flex items-start gap-3 overflow-hidden">
          <div className="flex flex-col items-start gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-blue-600" />
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:9"
            >
              Primary
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:10"
            >
              #2563EB
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-white border border-blue-200" />
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:13"
            >
              Primary Foreground
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:14"
            >
              #FFFFFF
            </p>
          </div>
        </div>
        <p
          className="w-max font-inter text-[12px] leading-[14.52px] font-medium tracking-[0.48px] text-slate-600"
          data-figma-id="4:15"
        >
          NEUTRALS
        </p>
        <div className="flex items-start gap-3 overflow-hidden">
          <div className="flex flex-col items-start gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-slate-950" />
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:19"
            >
              Foreground
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:20"
            >
              #0F172A
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-slate-600" />
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:23"
            >
              Muted
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:24"
            >
              #64748B
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-slate-400" />
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:27"
            >
              Placeholder
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:28"
            >
              #94A3B8
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-blue-200" />
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:31"
            >
              Border
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:32"
            >
              #E2E8F0
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-neutral-50" />
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:35"
            >
              Surface
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:36"
            >
              #F8FAFC
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-white border border-blue-200" />
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:39"
            >
              Background
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:40"
            >
              #FFFFFF
            </p>
          </div>
        </div>
        <p
          className="w-max font-inter text-[12px] leading-[14.52px] font-medium tracking-[0.48px] text-slate-600"
          data-figma-id="4:41"
        >
          SEMANTIC
        </p>
        <div className="flex items-start gap-3 overflow-hidden">
          <div className="flex flex-col items-start gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-[#ef4444]" />
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:45"
            >
              Error
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:46"
            >
              #EF4444
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-[#22c55e]" />
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:49"
            >
              Success
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:50"
            >
              #22C55E
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-[#f59e0b]" />
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:53"
            >
              Warning
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:54"
            >
              #F59E0B
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start gap-5 absolute left-[507px] top-[260px] w-[520px] h-fit p-6 bg-white rounded-xl overflow-hidden">
        <p
          className="w-max font-inter text-[16px] leading-[19.36px] font-semibold text-slate-950"
          data-figma-id="4:56"
        >
          Typography Scale
        </p>
        <div className="flex items-center gap-6 overflow-hidden">
          <div className="flex flex-col items-start gap-[2px] w-30 overflow-hidden">
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:59"
            >
              Title
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:60"
            >
              Inter Bold / 28px / 34px
            </p>
          </div>
          <h2
            className="w-max font-inter text-[28px] leading-[34px] font-bold text-slate-950"
            data-figma-id="4:61"
          >
            Create Account
          </h2>
        </div>
        <div className="flex items-center gap-6 overflow-hidden">
          <div className="flex flex-col items-start gap-[2px] w-30 overflow-hidden">
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:64"
            >
              Subtitle
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:65"
            >
              Inter Regular / 14px / 20px
            </p>
          </div>
          <p
            className="w-max font-inter text-[14px] leading-[20px] text-slate-950"
            data-figma-id="4:66"
          >
            Sign up in seconds to start building.
          </p>
        </div>
        <div className="flex items-center gap-6 overflow-hidden">
          <div className="flex flex-col items-start gap-[2px] w-30 overflow-hidden">
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:69"
            >
              Label
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:70"
            >
              Inter Medium / 13px / 16px
            </p>
          </div>
          <p
            className="w-max font-inter text-[13px] leading-[16px] font-medium text-slate-950"
            data-figma-id="4:71"
          >
            Full Name
          </p>
        </div>
        <div className="flex items-center gap-6 overflow-hidden">
          <div className="flex flex-col items-start gap-[2px] w-30 overflow-hidden">
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:74"
            >
              Input Text
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:75"
            >
              Inter Regular / 14px / 17px
            </p>
          </div>
          <p
            className="w-max font-inter text-[14px] leading-[17px] text-slate-950"
            data-figma-id="4:76"
          >
            you@example.com
          </p>
        </div>
        <div className="flex items-center gap-6 overflow-hidden">
          <div className="flex flex-col items-start gap-[2px] w-30 overflow-hidden">
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:79"
            >
              Button
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:80"
            >
              Inter Semi Bold / 14px / 17px
            </p>
          </div>
          <p
            className="w-max font-inter text-[14px] leading-[17px] font-semibold text-slate-950"
            data-figma-id="4:81"
          >
            Sign Up
          </p>
        </div>
        <div className="flex items-center gap-6 overflow-hidden">
          <div className="flex flex-col items-start gap-[2px] w-30 overflow-hidden">
            <p
              className="w-max font-inter text-[11px] leading-[13.31px] font-medium text-slate-950"
              data-figma-id="4:84"
            >
              Link
            </p>
            <p
              className="w-max font-inter text-[10px] leading-[12.1px] text-slate-600"
              data-figma-id="4:85"
            >
              Inter Regular / 14px / 17px
            </p>
          </div>
          <p
            className="w-max font-inter text-[14px] leading-[17px] text-blue-600"
            data-figma-id="4:86"
          >
            Already have an account? Log in
          </p>
        </div>
      </div>
    </div>
  )
}
