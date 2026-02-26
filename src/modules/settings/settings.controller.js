const { getGeneralSettings, upsertGeneralSettings } = require('./settings.service');

const MAX_AMOUNT = 1000000000;
const MAX_FACTOR = 1000;

const buildValidationError = (errors) => {
  const err = new Error('Donnees invalides.');
  err.statusCode = 400;
  err.errors = errors;
  return err;
};

const toOptionalString = (value) => (typeof value === 'string' ? value.trim() : undefined);

const parseOptionalNumber = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
};

const validateSettingsPayload = (body) => {
  const payload = {};
  const errors = [];

  const mallAddress = toOptionalString(body.mallAddress);
  if (mallAddress !== undefined) {
    if (mallAddress.length > 300) {
      errors.push({ field: 'mallAddress', message: 'Adresse trop longue (maximum 300 caracteres).' });
    } else {
      payload.mallAddress = mallAddress;
    }
  }

  const mallLatitude = parseOptionalNumber(body.mallLatitude);
  if (mallLatitude !== undefined) {
    if (!Number.isFinite(mallLatitude) || mallLatitude < -90 || mallLatitude > 90) {
      errors.push({ field: 'mallLatitude', message: 'Latitude invalide (entre -90 et 90).' });
    } else {
      payload.mallLatitude = mallLatitude;
    }
  }

  const mallLongitude = parseOptionalNumber(body.mallLongitude);
  if (mallLongitude !== undefined) {
    if (!Number.isFinite(mallLongitude) || mallLongitude < -180 || mallLongitude > 180) {
      errors.push({ field: 'mallLongitude', message: 'Longitude invalide (entre -180 et 180).' });
    } else {
      payload.mallLongitude = mallLongitude;
    }
  }

  const defaultPenaltyFee = parseOptionalNumber(body.defaultPenaltyFee);
  if (defaultPenaltyFee !== undefined) {
    if (!Number.isFinite(defaultPenaltyFee) || defaultPenaltyFee < 0 || defaultPenaltyFee > MAX_AMOUNT) {
      errors.push({ field: 'defaultPenaltyFee', message: `Frais de penalite invalide (entre 0 et ${MAX_AMOUNT}).` });
    } else {
      payload.defaultPenaltyFee = defaultPenaltyFee;
    }
  }

  const penaltyGrowthFactor = parseOptionalNumber(body.penaltyGrowthFactor);
  if (penaltyGrowthFactor !== undefined) {
    if (!Number.isFinite(penaltyGrowthFactor) || penaltyGrowthFactor < 0 || penaltyGrowthFactor > MAX_FACTOR) {
      errors.push({ field: 'penaltyGrowthFactor', message: `Coefficient invalide (entre 0 et ${MAX_FACTOR}).` });
    } else {
      payload.penaltyGrowthFactor = penaltyGrowthFactor;
    }
  }

  const defaultTerminationFee = parseOptionalNumber(body.defaultTerminationFee);
  if (defaultTerminationFee !== undefined) {
    if (!Number.isFinite(defaultTerminationFee) || defaultTerminationFee < 0 || defaultTerminationFee > MAX_AMOUNT) {
      errors.push({ field: 'defaultTerminationFee', message: `Frais de rupture invalide (entre 0 et ${MAX_AMOUNT}).` });
    } else {
      payload.defaultTerminationFee = defaultTerminationFee;
    }
  }

  const defaultOnlineSalesCommissionPercent = parseOptionalNumber(body.defaultOnlineSalesCommissionPercent);
  if (defaultOnlineSalesCommissionPercent !== undefined) {
    if (
      !Number.isFinite(defaultOnlineSalesCommissionPercent) ||
      defaultOnlineSalesCommissionPercent < 0 ||
      defaultOnlineSalesCommissionPercent > 100
    ) {
      errors.push({
        field: 'defaultOnlineSalesCommissionPercent',
        message: 'Commission en ligne invalide (entre 0 et 100).'
      });
    } else {
      payload.defaultOnlineSalesCommissionPercent = defaultOnlineSalesCommissionPercent;
    }
  }

  return { payload, errors };
};

const readGeneralSettings = async (req, res, next) => {
  try {
    const settings = await getGeneralSettings();
    return res.json(settings);
  } catch (error) {
    return next(error);
  }
};

const readPublicGeneralSettings = async (req, res, next) => {
  try {
    const settings = await getGeneralSettings();
    return res.json({
      mallAddress: settings.mallAddress ?? '',
      mallLatitude: settings.mallLatitude ?? 0,
      mallLongitude: settings.mallLongitude ?? 0
    });
  } catch (error) {
    return next(error);
  }
};

const updateGeneralSettings = async (req, res, next) => {
  try {
    const { payload, errors } = validateSettingsPayload(req.body || {});
    if (errors.length > 0) {
      return next(buildValidationError(errors));
    }

    const settings = await upsertGeneralSettings(payload);
    return res.json({
      message: 'Parametrage general mis a jour.',
      settings
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  readGeneralSettings,
  readPublicGeneralSettings,
  updateGeneralSettings
};
