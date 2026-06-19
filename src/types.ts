export type TemperatureOption = {
  label: string
  probability: number
}

export type CityMarket = {
  city: string
  cityZh: string
  endDate: string
  marketDateLabel: string
  marketUrl: string
  options: TemperatureOption[]
  slug: string
  topOption: TemperatureOption
  topFour: TemperatureOption[]
  topOptionProbability: number
  trigger: boolean
  volume24hr: number
}

export type MarketsResponse = {
  cities: CityMarket[]
  filteredCities: CityMarket[]
  generatedAt: string
  sourceCount: number
  threshold: number
}
