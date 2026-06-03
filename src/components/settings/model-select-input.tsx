import { useMemo } from "react"
import { Input } from "@/components/ui/input"

interface ModelSelectInputProps {
  value: string
  options: string[]
  selectPlaceholder: string
  inputPlaceholder: string
  onChange: (value: string) => void
}

interface ModelSelectOption {
  value: string
  label: string
}

export function buildModelSelectOptions(value: string, options: string[]): ModelSelectOption[] {
  const current = value.trim()
  const fetched = Array.from(new Set(options.map((item) => item.trim()).filter(Boolean)))
  const hasFetchedModels = fetched.length > 0
  const hasCurrentInFetched = current ? fetched.includes(current) : false
  const ordered = current && hasCurrentInFetched
    ? [current, ...fetched.filter((model) => model !== current)]
    : fetched

  if (current && hasFetchedModels && !hasCurrentInFetched) {
    return [
      { value: current, label: `当前填写：${current}（不在已拉取模型中）` },
      ...ordered.map((model) => ({ value: model, label: model })),
    ]
  }

  if (current && !hasFetchedModels) {
    return [{ value: current, label: current }]
  }

  return ordered.map((model) => ({ value: model, label: model }))
}

export function ModelSelectInput({
  value,
  options,
  selectPlaceholder,
  inputPlaceholder,
  onChange,
}: ModelSelectInputProps) {
  const selectOptions = useMemo(
    () => buildModelSelectOptions(value, options),
    [options, value],
  )

  return (
    <div className="flex flex-col gap-2 lg:flex-row">
      <select
        value={value.trim() || "__empty__"}
        onChange={(event) => onChange(event.target.value === "__empty__" ? "" : event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm lg:w-72"
      >
        <option value="__empty__">{selectPlaceholder}</option>
        {selectOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={inputPlaceholder}
        className="w-full"
      />
    </div>
  )
}
