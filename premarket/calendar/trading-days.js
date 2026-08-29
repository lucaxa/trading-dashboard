const WEEKEND_DAYS = new Set([
    0,
    6
]);

/*
 * Exchange holiday dates are kept separately from the
 * weekend calculation.
 *
 * This is intentionally a small deterministic fixture for
 * the PMSE research/replay layer.
 *
 * The production calendar source will be introduced as a
 * separate adapter and must supply authoritative NSE dates.
 */
const NSE_HOLIDAYS_2026 = Object.freeze({
    "2026-01-26": "Republic Day",
    "2026-03-03": "Holi",
    "2026-03-26": "Ram Navami",
    "2026-03-31": "Mahavir Jayanti",
    "2026-04-03": "Good Friday",
    "2026-04-14": "Dr. Babasaheb Ambedkar Jayanti",
    "2026-05-01": "Maharashtra Day",
    "2026-05-27": "Bakri Id",
    "2026-06-26": "Muharram",
    "2026-08-15": "Independence Day / Parsi New Year",
    "2026-08-26": "Ganesh Chaturthi",
    "2026-09-14": "Onam",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-10-20": "Dussehra",
    "2026-11-10": "Diwali-Balipratipada",
    "2026-11-24": "Guru Nanak Jayanti",
    "2026-12-25": "Christmas"
});


export function isWeekend(dateString) {

    const date =
        new Date(
            `${dateString}T12:00:00+05:30`
        );

    return WEEKEND_DAYS.has(
        date.getUTCDay()
    );

}


export function isNSEHoliday(
    dateString,
    holidays = NSE_HOLIDAYS_2026
) {

    return Boolean(
        holidays?.[dateString]
    );

}


export function isTradingDay(
    dateString,
    holidays = NSE_HOLIDAYS_2026
) {

    if (!dateString) {
        return false;
    }

    if (isWeekend(dateString)) {
        return false;
    }

    return !isNSEHoliday(
        dateString,
        holidays
    );

}


export function previousTradingDay(
    marketDate,
    holidays = NSE_HOLIDAYS_2026
) {

    if (!marketDate) {

        throw new Error(
            "marketDate is required"
        );

    }


    const date =
        new Date(
            `${marketDate}T12:00:00+05:30`
        );


    for (
        let attempts = 0;
        attempts < 370;
        attempts++
    ) {

        date.setUTCDate(
            date.getUTCDate() - 1
        );


        const candidate =
            formatISTDate(date);


        if (
            isTradingDay(
                candidate,
                holidays
            )
        ) {

            return candidate;

        }

    }


    throw new Error(
        "Unable to resolve previous trading day"
    );

}


export function getNSEHolidayCalendar() {

    return {
        ...NSE_HOLIDAYS_2026
    };

}


function formatISTDate(date) {

    const formatter =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone:
                    "Asia/Kolkata",

                year:
                    "numeric",

                month:
                    "2-digit",

                day:
                    "2-digit"
            }
        );


    return formatter.format(date);

}
