const GeneralSettings = require('./general-settings.model');

const SETTINGS_KEY = 'GENERAL';

const DEFAULT_SETTINGS = {
  mallAddress: '',
  mallLatitude: 0,
  mallLongitude: 0,
  defaultPenaltyFee: 0,
  penaltyGrowthFactor: 1,
  defaultTerminationFee: 0,
  defaultOnlineSalesCommissionPercent: 0
};

const toSettingsDto = (doc) => {
  if (!doc) return { ...DEFAULT_SETTINGS };

  return {
    mallAddress: doc.mallAddress ?? '',
    mallLatitude: doc.mallLatitude ?? 0,
    mallLongitude: doc.mallLongitude ?? 0,
    defaultPenaltyFee: doc.defaultPenaltyFee ?? 0,
    penaltyGrowthFactor: doc.penaltyGrowthFactor ?? 1,
    defaultTerminationFee: doc.defaultTerminationFee ?? 0,
    defaultOnlineSalesCommissionPercent: doc.defaultOnlineSalesCommissionPercent ?? 0
  };
};

const getGeneralSettings = async () => {
  const settings = await GeneralSettings.findOne({ singletonKey: SETTINGS_KEY }).lean();
  return toSettingsDto(settings);
};

const upsertGeneralSettings = async (payload) => {
  const settings = await GeneralSettings.findOneAndUpdate(
    { singletonKey: SETTINGS_KEY },
    { $set: payload, $setOnInsert: { singletonKey: SETTINGS_KEY } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  return toSettingsDto(settings);
};

module.exports = {
  getGeneralSettings,
  upsertGeneralSettings
};
