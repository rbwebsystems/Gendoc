import { BAKFON_GUIDE_SECTIONS } from "../lib/bakfonGuide";

export function BakfonGuideModule() {
  return (
    <div className="dg-bakfon-guide pg-panel" aria-label="Bakfon Təlimat">
      <div className="dg-bakfon-guide-scroll dg-table-wrap">
        <table className="dg-table dg-table--bakfon-guide">
          <thead>
            <tr>
              <th colSpan={3} className="dg-bakfon-guide-title">
                Bakfon Təlimat
              </th>
            </tr>
            <tr>
              <th className="dg-bakfon-guide-col-head">RETAİL</th>
              <th className="dg-bakfon-guide-col-head">KREDİT</th>
              <th className="dg-bakfon-guide-col-head">POST FAİZLƏRİ</th>
            </tr>
          </thead>
          <tbody>
            {BAKFON_GUIDE_SECTIONS.map((section) => (
              <tr key={section.retailTitle}>
                <td className="dg-bakfon-guide-retail">
                  <div className="dg-bakfon-guide-retail-title">{section.retailTitle}</div>
                  <ul className="dg-bakfon-guide-list">
                    {section.retailItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </td>
                <td className="dg-bakfon-guide-credit">
                  <div className="dg-bakfon-guide-credit-term">{section.creditTerm}</div>
                  <div className="dg-bakfon-guide-credit-rate">{section.creditRate}</div>
                </td>
                <td className="dg-bakfon-guide-post">
                  {section.postBank ? (
                    <>
                      <div className="dg-bakfon-guide-bank">{section.postBank}</div>
                      {section.postRates?.map((rate) => (
                        <div key={rate} className="dg-bakfon-guide-rate">
                          {rate}
                        </div>
                      ))}
                      {section.postCashbacks?.map((cb) => (
                        <div key={cb.label} className="dg-bakfon-guide-cashback">
                          <span>{cb.label}</span>
                          <span>{cb.value}</span>
                        </div>
                      ))}
                      {section.postNote ? <div className="dg-bakfon-guide-note">{section.postNote}</div> : null}
                    </>
                  ) : (
                    <span className="dg-bakfon-guide-empty">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
